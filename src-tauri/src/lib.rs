use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

// State to hold pending deep link URL until frontend is ready
struct PendingDeepLink(Mutex<Option<String>>);

// Command for frontend to signal it's ready and get any pending deep link
#[tauri::command]
fn frontend_ready(state: tauri::State<PendingDeepLink>) -> Option<String> {
    log::info!("[DeepLink] Frontend ready command called");
    if let Ok(mut pending) = state.0.lock() {
        let url = pending.take();
        if let Some(ref url_str) = url {
            log::info!("[DeepLink] Returning pending URL: {}", url_str);
        } else {
            log::info!("[DeepLink] No pending URL to return");
        }
        url
    } else {
        log::error!("[DeepLink] Failed to lock pending state");
        None
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PendingDeepLink(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![frontend_ready])
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Forward deep link args to running instance
            if let Some(url) = args.get(1) {
                log::info!("[SingleInstance] Found arg: {}", url);
                if url.starts_with("promptvault://") {
                    log::info!("[SingleInstance] Forwarding deep link: {}", url);
                    
                    // Try multiple times with delays to ensure frontend receives the event
                    let app_clone = app.clone();
                    let url_clone = url.clone();
                    
                    // Immediate emit
                    let _ = app.emit("deep-link", url.clone());
                    
                    // Delayed emit attempts
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        log::info!("[SingleInstance] Emitting deep-link event (500ms delay): {}", url_clone);
                        let _ = app_clone.emit("deep-link", url_clone.clone());
                        
                        std::thread::sleep(std::time::Duration::from_millis(1000));
                        log::info!("[SingleInstance] Emitting deep-link event (1500ms delay): {}", url_clone);
                        let _ = app_clone.emit("deep-link", url_clone);
                    });
                } else {
                    log::info!("[SingleInstance] Ignoring non-deep-link arg: {}", url);
                }
            } else {
                log::info!("[SingleInstance] No arguments found");
            }
            // Focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Register deep link protocol handler (needed for dev mode on all platforms)
            {
                if let Err(e) = app.deep_link().register_all() {
                    log::warn!("Failed to register deep link handler: {:?}", e);
                } else {
                    log::info!("Deep link handler registered successfully");
                }
            }

            // Additional development mode setup
            #[cfg(debug_assertions)]
            {
                log::info!("[DeepLink] Development mode detected - ensuring protocol registration");
                // In development, also try to register via alternative method
                if let Err(e) = app.deep_link().register("promptvault") {
                    log::warn!("Failed to register promptvault scheme specifically: {:?}", e);
                } else {
                    log::info!("promptvault scheme registered successfully");
                }
            }

            // Check for cold-start deep link from CLI args (Linux/Windows)
            // Store in state - will be returned when frontend calls frontend_ready command
            let args: Vec<String> = std::env::args().collect();
            log::info!("[DeepLink] CLI args: {:?}", args);
            if let Some(url) = args.get(1).cloned() {
                log::info!("[DeepLink] Found URL arg: {}", url);
                if url.starts_with("promptvault://") {
                    log::info!("[DeepLink] Cold start with URL, storing for later: {}", url);
                    if let Ok(mut pending) = app.state::<PendingDeepLink>().0.lock() {
                        *pending = Some(url.clone());
                        log::info!("[DeepLink] Successfully stored pending URL: {}", url);
                    } else {
                        log::error!("[DeepLink] Failed to lock pending state");
                    }
                } else {
                    log::info!("[DeepLink] URL does not start with promptvault://, ignoring");
                }
            } else {
                log::info!("[DeepLink] No URL argument found");
            }

            // Handle deep links when app is already running (macOS)
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if let Some(url) = event.urls().first() {
                    log::info!("[DeepLink] onOpenUrl: {}", url);
                    let _ = handle.emit("deep-link", url.to_string());
                }
            });
            // Setup logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Register global shortcut: Cmd+Shift+P (macOS) / Ctrl+Shift+P (Windows/Linux)
            #[cfg(target_os = "macos")]
            let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyP);
            #[cfg(not(target_os = "macos"))]
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyP);

            let window = app.get_webview_window("main").unwrap();

            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                // Toggle window visibility
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            })?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
