//! Portable PostgreSQL lifecycle for the desktop app.
//!
//! The app ships a trimmed PG under `resources/pg`. On first launch we run
//! `initdb` into the app-data directory, start `postgres` on a free loopback
//! port, create the `vexnar` database, and hand the DSN to the Go sidecar via
//! `VEXNAR_PG_DSN`. On exit the cluster is stopped with `pg_ctl -m fast`.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::Manager;

const PG_USER: &str = "vexnar";
const PG_DB: &str = "vexnar";
const READY_TIMEOUT: Duration = Duration::from_secs(30);

/// Holds the running cluster between startup and app exit.
#[derive(Default)]
pub struct PgState(pub Mutex<Option<PgRuntime>>);

pub struct PgRuntime {
    bin_dir: PathBuf,
    data_dir: PathBuf,
    port: u16,
    password: String,
    child: Option<Child>,
    log_path: PathBuf,
}

impl PgRuntime {
    pub fn start(bin_dir: PathBuf, home: &Path, log_dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(home).map_err(|e| format!("创建应用数据目录失败: {e}"))?;
        fs::create_dir_all(log_dir).map_err(|e| format!("创建日志目录失败: {e}"))?;

        let data_dir = home.join("pgdata");
        let initialized = data_dir.join("PG_VERSION").is_file();
        if initialized {
            stop_leftover(&bin_dir, &data_dir);
        }
        let password = load_password(home, initialized)?;

        if !initialized {
            if data_dir.exists()
                && fs::read_dir(&data_dir)
                    .map(|mut it| it.next().is_some())
                    .unwrap_or(true)
            {
                return Err(format!(
                    "PostgreSQL 数据目录非空但缺少 PG_VERSION：{}",
                    data_dir.display()
                ));
            }
            fs::create_dir_all(&data_dir).map_err(|e| format!("创建 PG 数据目录失败: {e}"))?;
            let pwfile = home.join(".pg-initdb-pw");
            write_private(&pwfile, password.as_bytes())?;
            let output = Command::new(bin_path(&bin_dir, "initdb"))
                .arg("-D")
                .arg(&data_dir)
                .arg("-U")
                .arg(PG_USER)
                .arg("--auth-local=trust")
                .arg("--auth-host=scram-sha-256")
                .arg("--pwfile")
                .arg(&pwfile)
                .arg("--encoding=UTF8")
                .arg("--locale=C")
                .output()
                .map_err(|e| format!("无法执行 initdb: {e}"))?;
            let _ = fs::remove_file(&pwfile);
            if !output.status.success() {
                return Err(format!("initdb 失败：{}", tail(&output.stderr)));
            }
        }

        let port = free_port()?;
        let log_path = log_dir.join("postgres.log");
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .map_err(|e| format!("打开 PostgreSQL 日志失败: {e}"))?;
        let log_err = log
            .try_clone()
            .map_err(|e| format!("复制日志句柄失败: {e}"))?;

        let child = Command::new(bin_path(&bin_dir, "postgres"))
            .arg("-D")
            .arg(&data_dir)
            .arg("-p")
            .arg(port.to_string())
            .arg("-c")
            .arg("listen_addresses=127.0.0.1")
            .stdin(Stdio::null())
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(log_err))
            .spawn()
            .map_err(|e| format!("无法启动 postgres: {e}"))?;

        let mut runtime = Self {
            bin_dir,
            data_dir,
            port,
            password,
            child: Some(child),
            log_path,
        };

        if let Err(err) = runtime.wait_ready() {
            runtime.stop();
            return Err(format!("{err}\n日志：{}", runtime.log_path.display()));
        }
        if let Err(err) = runtime.ensure_database() {
            runtime.stop();
            return Err(format!("{err}\n日志：{}", runtime.log_path.display()));
        }
        Ok(runtime)
    }

    pub fn dsn(&self) -> String {
        format!(
            "postgres://{}:{}@127.0.0.1:{}/{}?sslmode=disable",
            PG_USER, self.password, self.port, PG_DB
        )
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    fn wait_ready(&mut self) -> Result<(), String> {
        let deadline = Instant::now() + READY_TIMEOUT;
        loop {
            if let Some(child) = self.child.as_mut() {
                match child.try_wait() {
                    Ok(Some(status)) => return Err(format!("postgres 提前退出：{status}")),
                    Ok(None) => {}
                    Err(e) => return Err(format!("无法读取 postgres 状态：{e}")),
                }
            }
            if self.psql("SELECT 1").is_ok() {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(format!(
                    "postgres 在 {} 秒内未就绪",
                    READY_TIMEOUT.as_secs()
                ));
            }
            sleep(Duration::from_millis(200));
        }
    }

    fn ensure_database(&self) -> Result<(), String> {
        let exists = self.psql("SELECT 1 FROM pg_database WHERE datname = 'vexnar'")?;
        if exists.trim() == "1" {
            return Ok(());
        }
        let output = Command::new(bin_path(&self.bin_dir, "createdb"))
            .arg("-h")
            .arg("127.0.0.1")
            .arg("-p")
            .arg(self.port.to_string())
            .arg("-U")
            .arg(PG_USER)
            .arg(PG_DB)
            .env("PGPASSWORD", &self.password)
            .env("PGCONNECT_TIMEOUT", "3")
            .output()
            .map_err(|e| format!("无法执行 createdb: {e}"))?;
        if output.status.success() {
            return Ok(());
        }
        let err = tail(&output.stderr);
        if err.contains("already exists") {
            return Ok(());
        }
        Err(format!("创建数据库失败：{err}"))
    }

    fn psql(&self, sql: &str) -> Result<String, String> {
        let output = Command::new(bin_path(&self.bin_dir, "psql"))
            .arg("-h")
            .arg("127.0.0.1")
            .arg("-p")
            .arg(self.port.to_string())
            .arg("-U")
            .arg(PG_USER)
            .arg("-d")
            .arg("postgres")
            .arg("-tAc")
            .arg(sql)
            .env("PGPASSWORD", &self.password)
            .env("PGCONNECT_TIMEOUT", "3")
            .output()
            .map_err(|e| format!("无法执行 psql: {e}"))?;
        if !output.status.success() {
            return Err(tail(&output.stderr));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    pub fn stop(&mut self) {
        if self.child.is_none() {
            return;
        }
        let _ = Command::new(bin_path(&self.bin_dir, "pg_ctl"))
            .arg("-D")
            .arg(&self.data_dir)
            .arg("-m")
            .arg("fast")
            .arg("-w")
            .arg("-t")
            .arg("10")
            .arg("stop")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        if let Some(mut child) = self.child.take() {
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) if Instant::now() < deadline => sleep(Duration::from_millis(100)),
                    _ => {
                        let _ = child.kill();
                        let _ = child.wait();
                        break;
                    }
                }
            }
        }
    }
}

impl Drop for PgRuntime {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Starts portable PG when available; returns the DSN to inject into the sidecar.
/// An explicit `VEXNAR_PG_DSN` always wins, and `VEXNAR_PG_DISABLE=1` keeps the
/// old "bring your own database" path for development.
pub fn ensure(
    app: &tauri::AppHandle,
    home: &Path,
    log_dir: &Path,
) -> Result<Option<String>, String> {
    if let Ok(dsn) = std::env::var("VEXNAR_PG_DSN") {
        if !dsn.trim().is_empty() {
            println!("[pg] 使用 VEXNAR_PG_DSN");
            return Ok(Some(dsn));
        }
    }
    if matches!(std::env::var("VEXNAR_PG_DISABLE").as_deref(), Ok("1")) {
        println!("[pg] VEXNAR_PG_DISABLE=1，跳过内置 PostgreSQL");
        return Ok(None);
    }

    if let Some(bin_dir) = resolve_bin_dir(app) {
        let runtime = PgRuntime::start(bin_dir, home, log_dir)?;
        let dsn = runtime.dsn();
        println!("[pg] 内置 PostgreSQL 就绪 127.0.0.1:{}", runtime.port());
        app.state::<PgState>()
            .0
            .lock()
            .map_err(|_| "PostgreSQL 状态锁已损坏".to_string())?
            .replace(runtime);
        return Ok(Some(dsn));
    }

    if std::env::var_os("VEXNAR_CONFIG").is_some() {
        println!("[pg] 未找到内置 PostgreSQL，回退到 VEXNAR_CONFIG");
        return Ok(None);
    }
    Err("未找到内置 PostgreSQL（resources/pg），且未设置 VEXNAR_PG_DSN".to_string())
}

pub fn stop(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<PgState>() else {
        return;
    };
    let runtime = state.0.lock().ok().and_then(|mut guard| guard.take());
    if let Some(mut runtime) = runtime {
        runtime.stop();
    }
}

/// Development/smoke fallback when there is no Tauri app handle.
pub fn dev_bin_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("VEXNAR_PG_BIN") {
        let dir = PathBuf::from(dir);
        if bin_path(&dir, "initdb").is_file() {
            return Some(dir);
        }
    }
    #[cfg(debug_assertions)]
    {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/pg/bin");
        if bin_path(&dev, "initdb").is_file() {
            return Some(dev);
        }
    }
    None
}

fn resolve_bin_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Some(dir) = dev_bin_dir() {
        return Some(dir);
    }
    if let Ok(resources) = app.path().resource_dir() {
        for candidate in [
            resources.join("pg").join("bin"),
            resources.join("resources").join("pg").join("bin"),
        ] {
            if bin_path(&candidate, "initdb").is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn bin_path(dir: &Path, name: &str) -> PathBuf {
    if cfg!(windows) {
        dir.join(format!("{name}.exe"))
    } else {
        dir.join(name)
    }
}

fn free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("无法选择 PostgreSQL 端口: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("无法读取 PostgreSQL 端口: {e}"))?
        .port();
    drop(listener);
    Ok(port)
}

/// Stops a server left behind by a crashed or SIGKILLed previous run, then
/// removes a stale `postmaster.pid` so `postgres` can start again.
fn stop_leftover(bin_dir: &Path, data_dir: &Path) {
    let pid_file = data_dir.join("postmaster.pid");
    if !pid_file.exists() {
        return;
    }
    let _ = Command::new(bin_path(bin_dir, "pg_ctl"))
        .arg("-D")
        .arg(data_dir)
        .arg("-m")
        .arg("fast")
        .arg("-w")
        .arg("-t")
        .arg("10")
        .arg("stop")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if pid_file.exists() && !pid_alive(&pid_file) {
        let _ = fs::remove_file(&pid_file);
    }
}

#[cfg(unix)]
fn pid_alive(pid_file: &Path) -> bool {
    let Ok(text) = fs::read_to_string(pid_file) else {
        return false;
    };
    let Some(pid) = text
        .lines()
        .next()
        .and_then(|line| line.trim().parse::<i32>().ok())
    else {
        return false;
    };
    let rc = unsafe { libc::kill(pid, 0) };
    rc == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(not(unix))]
fn pid_alive(_pid_file: &Path) -> bool {
    false
}

fn load_password(home: &Path, initialized: bool) -> Result<String, String> {
    let path = home.join("pgpassword");
    if let Ok(content) = fs::read_to_string(&path) {
        let password = content.trim().to_string();
        if password.len() >= 16 {
            return Ok(password);
        }
    }
    if initialized {
        return Err(format!(
            "PostgreSQL 已初始化但密码文件缺失或损坏：{}",
            path.display()
        ));
    }
    let password = random_hex(24);
    write_private(&path, password.as_bytes())?;
    Ok(password)
}

fn write_private(path: &Path, data: &[u8]) -> Result<(), String> {
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .map_err(|e| format!("写入 {} 失败: {e}", path.display()))?;
    file.write_all(data)
        .map_err(|e| format!("写入 {} 失败: {e}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    if getrandom::fill(&mut buf).is_err() {
        // Practically unreachable; keep the password usable on exotic targets.
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        for (i, byte) in buf.iter_mut().enumerate() {
            *byte = ((nanos >> ((i % 16) * 8)) & 0xff) as u8;
        }
    }
    let mut out = String::with_capacity(bytes * 2);
    for byte in buf {
        use std::fmt::Write as _;
        let _ = write!(out, "{byte:02x}");
    }
    out
}

fn tail(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    text.trim().chars().take(2000).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_is_hex_and_long_enough() {
        let password = random_hex(24);
        assert_eq!(password.len(), 48);
        assert!(password.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn tail_keeps_utf8() {
        assert_eq!(tail("数据库启动失败".as_bytes()), "数据库启动失败");
    }
}
