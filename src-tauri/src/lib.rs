use tauri::Manager;

#[cfg(windows)]
mod windows_capture;

#[cfg(windows)]
#[tauri::command]
fn list_capture_sources() -> Result<Vec<windows_capture::CaptureSource>, String> {
    windows_capture::list_sources()
}

#[cfg(windows)]
#[tauri::command]
fn start_process_audio_capture(
    state: tauri::State<'_, windows_capture::AudioCaptureState>,
    process_id: u32,
) -> Result<windows_capture::AudioCaptureFormat, String> {
    windows_capture::start_process_audio(state.inner(), process_id)
}

#[cfg(windows)]
#[tauri::command]
fn read_process_audio_chunk(
    state: tauri::State<'_, windows_capture::AudioCaptureState>,
) -> Result<tauri::ipc::Response, String> {
    windows_capture::read_process_audio(state.inner())
}

#[cfg(windows)]
#[tauri::command]
fn stop_process_audio_capture(
    state: tauri::State<'_, windows_capture::AudioCaptureState>,
) -> Result<(), String> {
    windows_capture::stop_process_audio(state.inner())
}

#[cfg(windows)]
fn credential_entry(key: &str) -> Result<keyring::Entry, String> {
    if !matches!(key, "desktop-session" | "desktop-oauth-state") {
        return Err("Identificador de credencial inválido".to_string());
    }
    keyring::Entry::new("com.screengole.desktop", key).map_err(|error| error.to_string())
}

#[cfg(windows)]
#[tauri::command]
fn store_secure_value(key: String, value: String) -> Result<(), String> {
    credential_entry(&key)?.set_password(&value).map_err(|error| error.to_string())
}

#[cfg(windows)]
#[tauri::command]
fn load_secure_value(key: String) -> Result<Option<String>, String> {
    match credential_entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(windows)]
#[tauri::command]
fn delete_secure_value(key: String) -> Result<(), String> {
    match credential_entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(windows)]
    {
        builder = builder
            .manage(windows_capture::AudioCaptureState::default())
            .invoke_handler(tauri::generate_handler![
                list_capture_sources,
                start_process_audio_capture,
                read_process_audio_chunk,
                stop_process_audio_capture,
                store_secure_value,
                load_secure_value,
                delete_secure_value
            ]);
    }

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|_app| {
            #[cfg(all(debug_assertions, windows))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                _app.deep_link().register_all()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Screen Gole");
}
