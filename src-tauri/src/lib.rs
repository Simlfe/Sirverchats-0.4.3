use tauri::Manager;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    #[cfg(desktop)]
    {
        let _ = window.minimize();
    }
}

#[tauri::command]
fn toggle_maximize_window(window: tauri::Window) -> bool {
    #[cfg(desktop)]
    {
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
            return false;
        } else {
            let _ = window.maximize();
            return true;
        }
    }

    #[cfg(mobile)]
    {
        false
    }
}

#[tauri::command]
fn close_to_tray(window: tauri::Window) {
    #[cfg(desktop)]
    {
        let _ = window.hide();
    }

    #[cfg(mobile)]
    {
        let _ = window.close();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            minimize_window,
            toggle_maximize_window,
            close_to_tray
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                let show_i = MenuItem::with_id(
                    app,
                    "show",
                    "Show SirverData",
                    true,
                    None::<&str>,
                )?;

                let quit_i = MenuItem::with_id(
                    app,
                    "quit",
                    "Quit SirverData",
                    true,
                    None::<&str>,
                )?;

                let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

                let builder = TrayIconBuilder::new()
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }

                        "quit" => {
                            app.exit(0);
                        }

                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();

                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    });

                if let Some(icon) = app.default_window_icon() {
                    let _ = builder.icon(icon.clone()).build(app);
                } else {
                    let _ = builder.build(app);
                }
            }

            #[cfg(target_os = "linux")]
            {
                for window in app.webview_windows().values() {
                    let _ = window.with_webview(|webview| {
                        use webkit2gtk::traits::{PermissionRequestExt, SettingsExt, WebViewExt};
                        let inner = webview.inner();
                        if let Some(settings) = inner.settings() {
                            settings.set_enable_webrtc(true);
                            settings.set_enable_media_stream(true);
                            settings.set_enable_mediasource(true);
                        }
                        inner.connect_permission_request(move |_view, request| {
                            request.allow();
                            true
                        });
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}