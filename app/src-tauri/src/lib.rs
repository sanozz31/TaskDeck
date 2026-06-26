use std::sync::{mpsc, Arc, Mutex};
#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2::{class, msg_send, rc::Retained, runtime::Bool};
#[cfg(target_os = "macos")]
use objc2_foundation::NSError;
#[cfg(target_os = "macos")]
use objc2_user_notifications::{UNAuthorizationOptions, UNUserNotificationCenter};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, RunEvent, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// 显示并聚焦主窗口（托盘点击 / 菜单项共用）。
fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// 后端 sidecar 的动态端口（由其 stdout 的 `TASKDECK_PORT=<n>` 行上报）。
struct ServerPort(Mutex<Option<u16>>);
/// 持有 sidecar 子进程句柄，应用退出时 kill，避免残留 node 进程。
struct Sidecar(Mutex<Option<CommandChild>>);

#[cfg(target_os = "macos")]
fn is_bundled_app() -> bool {
    unsafe {
        let bundle: Retained<objc2::runtime::AnyObject> = msg_send![class!(NSBundle), mainBundle];
        let path: Retained<objc2::runtime::AnyObject> = msg_send![&*bundle, bundlePath];
        let cstr: *const std::ffi::c_char = msg_send![&*path, UTF8String];
        if cstr.is_null() {
            return false;
        }
        std::ffi::CStr::from_ptr(cstr)
            .to_string_lossy()
            .ends_with(".app")
    }
}

#[cfg(target_os = "macos")]
fn request_notification_authorization() -> bool {
    if !is_bundled_app() {
        return false;
    }

    let center = UNUserNotificationCenter::currentNotificationCenter();
    let options = UNAuthorizationOptions::Alert
        | UNAuthorizationOptions::Sound
        | UNAuthorizationOptions::Badge;
    let (tx, rx) = mpsc::channel();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let completion = RcBlock::new(move |granted: Bool, _error: *mut NSError| {
        if let Some(tx) = tx.lock().unwrap().take() {
            let _ = tx.send(granted.as_bool());
        }
    });
    center.requestAuthorizationWithOptions_completionHandler(options, &completion);
    // 加超时上限：未签名/缺通知 entitlement 的本地构建上，completion 可能永不回调，
    // 裸 recv() 会让 spawn_blocking 线程永久阻塞、前端 await 卡死（按钮停在「正在打开…」）。
    // 60s 远超用户响应系统授权弹窗所需，又能兜住「回调永不来」的死锁。
    rx.recv_timeout(std::time::Duration::from_secs(60)).unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
fn request_notification_authorization() -> bool {
    false
}

#[tauri::command]
async fn request_notification_permission() -> bool {
    tauri::async_runtime::spawn_blocking(request_notification_authorization)
        .await
        .unwrap_or(false)
}

/// 打开系统「设置 → 通知 → 万事」面板，引导用户手动开启通知。
/// 设计上不再读取/监测授权状态（该读取在未签名本地构建下不可靠），统一「点击前往开启」。
#[tauri::command]
fn open_notification_settings() {
    #[cfg(target_os = "macos")]
    {
        // 深链到本 App 的通知设置页（id 为 bundle identifier）
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.notifications?id=com.taskdeck.desktop")
            .spawn();
    }
}

/// 前端启动时 invoke 此命令拿到后端实际端口（未就绪则为 None，前端会重试 /health）。
#[tauri::command]
fn server_port(state: State<ServerPort>) -> Option<u16> {
    *state.0.lock().unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(ServerPort(Mutex::new(None)))
        .manage(Sidecar(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            server_port,
            request_notification_permission,
            open_notification_settings
        ])
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

            // 菜单栏（托盘）图标：左键点击打开万事主窗口，右键弹出功能菜单。
            // 图标用 template png，macOS 按菜单栏明暗自动着色。
            // 「进入XX」点击后显示主窗口并 emit navigate 事件，前端据此切换视图。
            // 菜单宽度由最宽项决定（macOS 无宽度 API），用全角空格补宽；两侧对称补白使文字居中。
            let pad = |t: &str| format!("\u{3000}\u{3000}{t}\u{3000}\u{3000}");
            let nav_chat = MenuItem::with_id(app, "nav:chat", pad("进入对话"), true, None::<&str>)?;
            let nav_cal =
                MenuItem::with_id(app, "nav:calendar", pad("查看日历"), true, None::<&str>)?;
            let nav_tags = MenuItem::with_id(app, "nav:tags", pad("查看标签"), true, None::<&str>)?;
            let nav_all = MenuItem::with_id(app, "nav:all", pad("全部任务"), true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let show_i = MenuItem::with_id(app, "show", pad("进入万事"), true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", pad("退出万事"), true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&nav_chat, &nav_cal, &nav_tags, &nav_all, &sep1, &show_i, &sep2, &quit_i],
            )?;

            TrayIconBuilder::with_id("main-tray")
                .icon(tauri::include_image!("icons/tray-template.png"))
                .icon_as_template(true)
                .tooltip("万事")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    match id {
                        "show" => show_main(app),
                        "quit" => app.exit(0),
                        _ if id.starts_with("nav:") => {
                            show_main(app);
                            let _ = app.emit("navigate", &id[4..]);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

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
