//! Tauri shell for DFR Toolkit.
//!
//! Spawns the bundled Flask sidecar (`seo-backend.exe`) on startup, reads the
//! `BACKEND_PORT=<n>` line it prints on first stdout flush, then:
//!   - stores the port in shared state
//!   - emits `backend-ready` to the frontend with `{ port }`
//!   - exposes `get_backend_port` as a Tauri command (for the frontend
//!     to resolve API base URLs in production builds).
//!
//! The sidecar process is killed when the app exits — Tauri's CommandChild
//! handle is dropped along with the main window's lifecycle.

use std::sync::Mutex;

use tauri::{Emitter, Manager, RunEvent, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
#[cfg(not(debug_assertions))]
use tauri_plugin_updater::UpdaterExt;

#[derive(Default)]
struct BackendState {
    port: Mutex<Option<u16>>,
    child: Mutex<Option<CommandChild>>,
}

#[tauri::command]
fn get_backend_port(state: State<'_, BackendState>) -> Option<u16> {
    *state.port.lock().unwrap()
}

fn spawn_sidecar(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let sidecar = app.shell().sidecar("seo-backend")?;
    let (mut rx, child) = sidecar.spawn()?;

    let state = app.state::<BackendState>();
    *state.child.lock().unwrap() = Some(child);

    // Read stdout in a Tauri-managed async task. The Python side prints the
    // port handshake on the very first line, then keeps logging.
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    let trimmed = line.trim();
                    if let Some(rest) = trimmed.strip_prefix("BACKEND_PORT=") {
                        if let Ok(port) = rest.parse::<u16>() {
                            log::info!("backend port handshake: {port}");
                            let state = app_handle.state::<BackendState>();
                            *state.port.lock().unwrap() = Some(port);
                            let _ = app_handle.emit("backend-ready", port);
                            continue;
                        }
                    }
                    if !trimmed.is_empty() {
                        log::info!("[backend] {trimmed}");
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        log::warn!("[backend.stderr] {trimmed}");
                    }
                }
                CommandEvent::Terminated(payload) => {
                    log::error!("backend exited: code={:?} signal={:?}", payload.code, payload.signal);
                    let _ = app_handle.emit("backend-exited", payload.code);
                    break;
                }
                CommandEvent::Error(err) => {
                    log::error!("backend sidecar error: {err}");
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(BackendState::default())
        .invoke_handler(tauri::generate_handler![get_backend_port])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            spawn_sidecar(app.handle())?;

            // Background-check for updates on launch. The plugin's built-in
            // dialog handles the prompt → download → install → relaunch flow,
            // so we don't need any frontend code to drive it. Disabled in
            // debug builds because the cargo workspace version (0.1.0) won't
            // satisfy any real semver constraint on the update manifest.
            #[cfg(not(debug_assertions))]
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    match app_handle.updater() {
                        Ok(updater) => match updater.check().await {
                            Ok(Some(update)) => {
                                log::info!(
                                    "update available: {} -> {}",
                                    update.current_version,
                                    update.version
                                );
                                if let Err(e) = update
                                    .download_and_install(|_chunk, _total| {}, || {})
                                    .await
                                {
                                    log::error!("update install failed: {e}");
                                } else {
                                    log::info!("update installed; relaunching");
                                    app_handle.restart();
                                }
                            }
                            Ok(None) => log::info!("no update available"),
                            Err(e) => log::warn!("update check failed: {e}"),
                        },
                        Err(e) => log::warn!("updater unavailable: {e}"),
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                // Kill the sidecar before the parent process exits. Tauri's
                // CommandChild::kill consumes the handle, hence the .take().
                let state = app_handle.state::<BackendState>();
                let child = state.child.lock().unwrap().take();
                if let Some(child) = child {
                    let _ = child.kill();
                }
            }
        });
}
