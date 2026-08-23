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
                stop_process_audio_capture
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
