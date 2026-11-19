//! Supervises the Go backend (`vexnar`) that ships with the desktop app.
//!
//! The shell does three things and nothing else:
//!   1. pick a free loopback port and start the sidecar on it;
//!   2. wait until `GET /api/health` answers 200;
//!   3. terminate the sidecar when the app exits.
//!
//! Runtime state lives under the OS app-data directory, never next to the
//! executable: an installed `.app` is read-only, but VEXNAR writes databases,
//! logs and the JWT key at runtime.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};

use tauri::Manager;

const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

/// Holds the child process between startup and app exit.
#[derive(Default)]
pub struct SidecarState(pub Mutex<Option<Child>>);

/// Starts the sidecar and returns the URL the window should load.
pub fn start(app: &tauri::AppHandle) -> Result<String, String> {
    let exe = resolve_sidecar()?;
    let port = free_port()?;
    let home = runtime_home(app)?;
    let data_dir = home.join("data");
    let log_dir = home.join("logs");
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("创建数据目录失败 {}: {e}", data_dir.display()))?;
    fs::create_dir_all(&log_dir)
        .map_err(|e| format!("创建日志目录失败 {}: {e}", log_dir.display()))?;

    let log_path = log_dir.join("sidecar.log");
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("打开日志失败 {}: {e}", log_path.display()))?;
    let log_err = log
        .try_clone()
        .map_err(|e| format!("复制日志句柄失败: {e}"))?;

    let mut cmd = Command::new(&exe);
    cmd.arg("-addr")
        .arg(format!("127.0.0.1:{port}"))
        .arg("-data")
        .arg(&data_dir)
        .arg("-keydir")
        .arg(&home)
        .current_dir(&home)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err));

    // In development the repo's config.json is the only database config we
    // have. A packaged client will pass a DSN (or its own portable PG) instead.
    #[cfg(debug_assertions)]
    if std::env::var_os("VEXNAR_CONFIG").is_none() {
        let repo_config = Path::new(env!("CARGO_MANIFEST_DIR")).join("../config.json");
        if repo_config.is_file() {
            cmd.env("VEXNAR_CONFIG", repo_config);
        }
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("无法启动 sidecar {}: {e}", exe.display()))?;
    app.state::<SidecarState>()
        .0
        .lock()
        .map_err(|_| "sidecar 状态锁已损坏".to_string())?
        .replace(child);

    let mut exited = || -> Option<String> {
        let state = app.try_state::<SidecarState>()?;
        let mut guard = state.0.lock().ok()?;
        let child = guard.as_mut()?;
        match child.try_wait() {
            Ok(Some(status)) => Some(format!("sidecar 提前退出：{status}")),
            Ok(None) => None,
            Err(e) => Some(format!("无法读取 sidecar 状态：{e}")),
        }
    };

    match wait_for_health(port, STARTUP_TIMEOUT, &mut exited) {
        Ok(()) => Ok(format!("http://127.0.0.1:{port}/")),
        Err(err) => {
            stop(app);
            Err(format!("{err}\n日志：{}", log_path.display()))
        }
    }
}

/// Stops the sidecar if it is still running. Safe to call more than once.
pub fn stop(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<SidecarState>() else {
        return;
    };
    let child = state.0.lock().ok().and_then(|mut guard| guard.take());
    if let Some(child) = child {
        terminate(child);
    }
}

pub fn smoke_requested() -> bool {
    std::env::var("VEXNAR_DESKTOP_SMOKE").as_deref() == Ok("1")
}

/// Headless check used by CI/local verification: start the sidecar, wait for
/// health, then shut it down. It deliberately does not create a window.
pub fn run_smoke() -> i32 {
    match smoke() {
        Ok(()) => {
            println!("[smoke] ok");
            0
        }
        Err(err) => {
            eprintln!("[smoke] failed: {err}");
            1
        }
    }
}

fn smoke() -> Result<(), String> {
    let exe = resolve_sidecar()?;
    let port = free_port()?;
    let home = std::env::temp_dir().join(format!("vexnar-desktop-smoke-{}", std::process::id()));
    let data_dir = home.join("data");
    fs::create_dir_all(&data_dir).map_err(|e| format!("创建 smoke 数据目录失败: {e}"))?;

    let mut cmd = Command::new(&exe);
    cmd.arg("-addr")
        .arg(format!("127.0.0.1:{port}"))
        .arg("-data")
        .arg(&data_dir)
        .arg("-keydir")
        .arg(&home)
        .current_dir(&home)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("无法启动 sidecar {}: {e}", exe.display()))?;

    let result = {
        let mut exited = || -> Option<String> {
            match child.try_wait() {
                Ok(Some(status)) => Some(format!("sidecar 提前退出：{status}")),
                Ok(None) => None,
                Err(e) => Some(format!("无法读取 sidecar 状态：{e}")),
            }
        };
        wait_for_health(port, STARTUP_TIMEOUT, &mut exited)
    };

    terminate(child);
    result.map(|()| println!("[smoke] sidecar ready on 127.0.0.1:{port}"))
}

/// Polls `/api/health` until it returns 200, the process exits, or time is up.
fn wait_for_health(
    port: u16,
    timeout: Duration,
    exited: &mut dyn FnMut() -> Option<String>,
) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Some(reason) = exited() {
            return Err(reason);
        }
        if health_ok(port) {
            return Ok(());
        }
        sleep(Duration::from_millis(200));
    }
    Err(format!(
        "sidecar 在 {} 秒内未通过 /api/health 检查",
        timeout.as_secs()
    ))
}

fn health_ok(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(400)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
    if stream
        .write_all(b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut buf = [0u8; 128];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    let head = String::from_utf8_lossy(&buf[..n]);
    head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200")
}

fn free_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("无法选择本地端口: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("无法读取本地端口: {e}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn runtime_home(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("VEXNAR_HOME") {
        return Ok(PathBuf::from(dir));
    }
    app.path()
        .app_data_dir()
        .map_err(|e| format!("无法解析应用数据目录: {e}"))
}

fn resolve_sidecar() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("VEXNAR_SIDECAR") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "VEXNAR_SIDECAR 指向的文件不存在: {}",
            path.display()
        ));
    }

    let exe = std::env::current_exe().map_err(|e| format!("无法定位当前程序: {e}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "无法定位当前程序所在目录".to_string())?;
    let name = if cfg!(windows) {
        "vexnar.exe"
    } else {
        "vexnar"
    };

    let bundled = dir.join(name);
    if bundled.is_file() {
        return Ok(bundled);
    }

    #[cfg(debug_assertions)]
    {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(name);
        if dev.is_file() {
            return Ok(dev);
        }
    }

    Err(format!(
        "未找到 sidecar：{}（请先运行 desktop/scripts/prepare-sidecar.sh）",
        bundled.display()
    ))
}

fn terminate(mut child: Child) {
    #[cfg(unix)]
    unsafe {
        libc::kill(child.id() as i32, libc::SIGTERM);
    }

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) if Instant::now() < deadline => sleep(Duration::from_millis(100)),
            _ => break,
        }
    }

    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_port_can_be_bound_again() {
        let port = free_port().expect("free port");
        let listener = TcpListener::bind(("127.0.0.1", port)).expect("rebind");
        drop(listener);
    }

    #[test]
    fn health_probe_accepts_200() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buf = [0u8; 256];
            let _ = stream.read(&mut buf);
            let _ = stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
        });

        assert!(health_ok(port));
        handle.join().expect("probe thread");
    }

    #[test]
    fn health_probe_rejects_500() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buf = [0u8; 256];
            let _ = stream.read(&mut buf);
            let _ = stream
                .write_all(b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n");
        });

        assert!(!health_ok(port));
        handle.join().expect("probe thread");
    }
}
