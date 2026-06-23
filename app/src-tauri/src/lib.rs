use std::sync::Mutex;
use tauri::{Manager, RunEvent, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// 后端 sidecar 的动态端口（由其 stdout 的 `TASKDECK_PORT=<n>` 行上报）。
struct ServerPort(Mutex<Option<u16>>);
/// 持有 sidecar 子进程句柄，应用退出时 kill，避免残留 node 进程。
struct Sidecar(Mutex<Option<CommandChild>>);

/// 前端启动时 invoke 此命令拿到后端实际端口（未就绪则为 None，前端会重试 /health）。
#[tauri::command]
fn server_port(state: State<ServerPort>) -> Option<u16> {
    *state.0.lock().unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(ServerPort(Mutex::new(None)))
        .manage(Sidecar(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![server_port])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // 拦截关闭按钮：阻止销毁窗口，改为隐藏
                    // 这样悬浮窗的放大按钮和 macOS 图标点击都能重新显示窗口
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // DB 落 app data 目录（首启由后端自动建目录 + 建表）
            let db_path = app.path().app_data_dir()?.join("taskdeck.db");
            // 后端入口：随包 resources/server/index.js
            let server_js = app.path().resource_dir()?.join("server").join("index.js");

            let cmd = app
                .shell()
                .sidecar("taskdeck-node")?
                .arg(server_js.to_string_lossy().to_string())
                .env("TASKDECK_PORT", "0") // 0 = 系统分配空闲端口，避免冲突
                .env("TASKDECK_DB", db_path.to_string_lossy().to_string());

            let (mut rx, child) = cmd.spawn()?;
            app.state::<Sidecar>().0.lock().unwrap().replace(child);

            // 异步读取 sidecar 输出：解析端口、转发 stderr 便于排错
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            let line = String::from_utf8_lossy(&bytes);
                            for tok in line.split_whitespace() {
                                if let Some(p) = tok.strip_prefix("TASKDECK_PORT=") {
                                    if let Ok(port) = p.parse::<u16>() {
                                        *handle.state::<ServerPort>().0.lock().unwrap() = Some(port);
                                    }
                                }
                            }
                        }
                        CommandEvent::Stderr(bytes) => {
                            eprintln!("[sidecar] {}", String::from_utf8_lossy(&bytes));
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            match event {
                // 应用退出时结束 sidecar，避免残留 node 进程
                RunEvent::Exit => {
                    if let Some(child) = app_handle.state::<Sidecar>().0.lock().unwrap().take() {
                        let _ = child.kill();
                    }
                }
                // macOS Dock/Launchpad 点击图标时恢复主窗口
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                _ => {}
            }
        });
}
