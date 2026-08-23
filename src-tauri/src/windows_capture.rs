use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{sync_channel, Receiver, TryRecvError},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
};
use tauri::ipc::Response;
use wasapi::{
    initialize_mta, AudioClient, Direction, SampleType, StreamMode, WaveFormat,
};
use windows_capture::{monitor::Monitor, window::Window};

const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u16 = 2;
const FRAMES_PER_CHUNK: usize = 960; // 20 ms at 48 kHz.

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSource {
    pub id: String,
    pub kind: &'static str,
    pub name: String,
    pub process_name: Option<String>,
    pub process_id: Option<u32>,
    pub width: u32,
    pub height: u32,
    pub audio_capable: bool,
}

pub fn list_sources() -> Result<Vec<CaptureSource>, String> {
    let mut sources = Vec::new();

    for monitor in Monitor::enumerate().map_err(|error| error.to_string())? {
        let index = monitor.index().map_err(|error| error.to_string())?;
        sources.push(CaptureSource {
            id: format!("monitor:{index}"),
            kind: "screen",
            name: monitor
                .name()
                .unwrap_or_else(|_| format!("Monitor {index}")),
            process_name: None,
            process_id: None,
            width: monitor.width().unwrap_or_default(),
            height: monitor.height().unwrap_or_default(),
            // Monitor audio still comes from the WebView2 system picker.
            audio_capable: false,
        });
    }

    let own_pid = std::process::id();
    let mut windows = Window::enumerate().map_err(|error| error.to_string())?;
    windows.sort_by_key(|window| window.as_raw_hwnd() as usize);

    for window in windows {
        let process_id = match window.process_id() {
            Ok(value) if value != own_pid => value,
            _ => continue,
        };
        let title = match window.title() {
            Ok(value) if !value.trim().is_empty() => value,
            _ => continue,
        };
        let width = window.width().unwrap_or_default().max(0) as u32;
        let height = window.height().unwrap_or_default().max(0) as u32;
        if width == 0 || height == 0 {
            continue;
        }

        sources.push(CaptureSource {
            id: format!("window:{}", window.as_raw_hwnd() as usize),
            kind: "window",
            name: title,
            process_name: window.process_name().ok(),
            process_id: Some(process_id),
            width,
            height,
            // Target-process loopback captures only this process tree, so audio
            // played by Screen Gole or another participant is not recaptured.
            audio_capable: true,
        });
    }

    Ok(sources)
}

pub struct AudioCaptureState(Mutex<Option<AudioCaptureWorker>>);

impl Default for AudioCaptureState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

struct AudioCaptureWorker {
    receiver: Receiver<Vec<u8>>,
    stop: Arc<AtomicBool>,
    error: Arc<Mutex<Option<String>>>,
    handle: Option<JoinHandle<()>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureFormat {
    sample_rate: u32,
    channels: u16,
    sample_format: &'static str,
}

fn stop_worker(worker: &mut Option<AudioCaptureWorker>) {
    if let Some(mut active) = worker.take() {
        active.stop.store(true, Ordering::Release);
        if let Some(handle) = active.handle.take() {
            let _ = handle.join();
        }
    }
}

pub fn start_process_audio(
    state: &AudioCaptureState,
    process_id: u32,
) -> Result<AudioCaptureFormat, String> {
    if process_id == 0 || process_id == std::process::id() {
        return Err("A fonte de áudio escolhida não é permitida".into());
    }

    let mut current = state.0.lock().map_err(|_| "Estado de áudio indisponível")?;
    stop_worker(&mut current);

    let (sender, receiver) = sync_channel::<Vec<u8>>(64);
    let stop = Arc::new(AtomicBool::new(false));
    let error = Arc::new(Mutex::new(None));
    let thread_stop = Arc::clone(&stop);
    let thread_error = Arc::clone(&error);
    let handle = thread::Builder::new()
        .name("screen-gole-process-audio".into())
        .spawn(move || {
            if let Err(message) = capture_process_audio(process_id, thread_stop, sender) {
                if let Ok(mut slot) = thread_error.lock() {
                    *slot = Some(message);
                }
            }
        })
        .map_err(|error| format!("Não foi possível iniciar o áudio nativo: {error}"))?;

    *current = Some(AudioCaptureWorker {
        receiver,
        stop,
        error,
        handle: Some(handle),
    });

    Ok(AudioCaptureFormat {
        sample_rate: SAMPLE_RATE,
        channels: CHANNELS,
        sample_format: "f32le",
    })
}

pub fn read_process_audio(state: &AudioCaptureState) -> Result<Response, String> {
    let current = state.0.lock().map_err(|_| "Estado de áudio indisponível")?;
    let worker = current
        .as_ref()
        .ok_or_else(|| "A captura de áudio não foi iniciada".to_string())?;

    let mut bytes = Vec::new();
    for _ in 0..10 {
        match worker.receiver.try_recv() {
            Ok(mut chunk) => bytes.append(&mut chunk),
            Err(TryRecvError::Empty) => break,
            Err(TryRecvError::Disconnected) => {
                let message = worker
                    .error
                    .lock()
                    .ok()
                    .and_then(|value| value.clone())
                    .unwrap_or_else(|| "A captura de áudio foi encerrada".into());
                if bytes.is_empty() {
                    return Err(message);
                }
                break;
            }
        }
    }

    Ok(Response::new(bytes))
}

pub fn stop_process_audio(state: &AudioCaptureState) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|_| "Estado de áudio indisponível")?;
    stop_worker(&mut current);
    Ok(())
}

fn capture_process_audio(
    process_id: u32,
    stop: Arc<AtomicBool>,
    sender: std::sync::mpsc::SyncSender<Vec<u8>>,
) -> Result<(), String> {
    initialize_mta()
        .ok()
        .map_err(|error| format!("Falha ao inicializar o áudio do Windows: {error}"))?;
    let format = WaveFormat::new(
        32,
        32,
        &SampleType::Float,
        SAMPLE_RATE as usize,
        CHANNELS as usize,
        None,
    );
    let block_align = format.get_blockalign() as usize;
    let mut client = AudioClient::new_application_loopback_client(process_id, true)
        .map_err(|error| error.to_string())?;
    client
        .initialize_client(
            &format,
            &Direction::Capture,
            &StreamMode::EventsShared {
                autoconvert: true,
                buffer_duration_hns: 200_000,
            },
        )
        .map_err(|error| error.to_string())?;
    let event = client.set_get_eventhandle().map_err(|error| error.to_string())?;
    let capture = client
        .get_audiocaptureclient()
        .map_err(|error| error.to_string())?;
    let mut queue = VecDeque::new();
    let chunk_size = block_align * FRAMES_PER_CHUNK;

    client.start_stream().map_err(|error| error.to_string())?;
    while !stop.load(Ordering::Acquire) {
        let frames = capture
            .get_next_packet_size()
            .map_err(|error| error.to_string())?
            .unwrap_or(0);
        if frames > 0 {
            capture
                .read_from_device_to_deque(&mut queue)
                .map_err(|error| error.to_string())?;
        }

        while queue.len() >= chunk_size {
            let chunk: Vec<u8> = queue.drain(..chunk_size).collect();
            if sender.try_send(chunk).is_err() {
                // Keep capture real-time: when the UI is late, discard the oldest
                // unsent chunk instead of accumulating latency indefinitely.
                break;
            }
        }

        let _ = event.wait_for_event(100);
    }
    let _ = client.stop_stream();
    Ok(())
}
