//! VEXNAR desktop shell.
//!
//! A thin Tauri window around the Go backend. All business logic stays in
//! `vexnar`; this crate only supervises the sidecar and hosts the WebView.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pg;
mod supervisor;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn main() {
    if supervisor::smoke_requested() {
        std::process::exit(supervisor::run_smoke());
    }

    tauri::Builder::default()
        .setup(|app| {
            app.manage(supervisor::SidecarState::default());
            app.manage(pg::PgState::default());

            #[cfg(unix)]
            supervisor::install_signal_cleanup(app.handle().clone());

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("VEXNAR")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 700.0)
                .center()
                .build()?;

            let handle = app.handle().clone();
            std::thread::spawn(move || match supervisor::start(&handle) {
                Ok(url) => {
                    if let Some(window) = handle.get_webview_window("main") {
                        match url.parse() {
                            Ok(url) => {
                                let _ = window.navigate(url);
                            }
                            Err(err) => {
                                let _ = window.eval(&format!(
                                    "window.__vexnarError && window.__vexnarError({})",
                                    serde_json::to_string(&format!("本地地址无效：{err}"))
                                        .unwrap_or_else(|_| "\"本地地址无效\"".into())
                                ));
                            }
                        }
                    }
                }
                Err(err) => {
                    eprintln!("[desktop] {err}");
                    if let Some(window) = handle.get_webview_window("main") {
                        let msg =
                            serde_json::to_string(&err).unwrap_or_else(|_| "\"启动失败\"".into());
                        let _ = window.eval(&format!(
                            "window.__vexnarError && window.__vexnarError({msg})"
                        ));
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build VEXNAR desktop app")
        .run(|handle, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                supervisor::stop(handle);
            }
        });
}
