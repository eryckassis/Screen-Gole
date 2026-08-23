import { invoke } from "@tauri-apps/api/core";
import type {
  NativeAudioSession,
  NativeCaptureBridge,
  NativeCaptureSource,
} from "../components/room-app";

type AudioCaptureFormat = {
  sampleRate: number;
  channels: number;
  sampleFormat: "f32le";
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function toBytes(value: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    value instanceof Uint8Array ? value : new Uint8Array(value),
  );
}

function schedulePcm(
  context: AudioContext,
  destination: MediaStreamAudioDestinationNode,
  raw: Uint8Array,
  nextTime: number,
) {
  const aligned = raw.byteLength - (raw.byteLength % 8);
  if (!aligned) return nextTime;

  const copy = raw.slice(0, aligned);
  const samples = new Float32Array(
    copy.buffer,
    copy.byteOffset,
    copy.byteLength / 4,
  );
  const frames = samples.length / 2;
  const buffer = context.createBuffer(2, frames, 48_000);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (let frame = 0; frame < frames; frame += 1) {
    left[frame] = samples[frame * 2];
    right[frame] = samples[frame * 2 + 1];
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
  const startAt = Math.max(nextTime, context.currentTime + 0.035);
  source.start(startAt);
  return startAt + buffer.duration;
}

async function readChunk() {
  return toBytes(
    await invoke<ArrayBuffer | Uint8Array>("read_process_audio_chunk"),
  );
}

async function startProcessAudio(
  processId: number,
): Promise<NativeAudioSession> {
  const format = await invoke<AudioCaptureFormat>(
    "start_process_audio_capture",
    { processId },
  );
  if (
    format.sampleRate !== 48_000 ||
    format.channels !== 2 ||
    format.sampleFormat !== "f32le"
  ) {
    await invoke("stop_process_audio_capture").catch(() => undefined);
    throw new Error(
      "O formato de áudio nativo retornado pelo Windows não é compatível",
    );
  }

  let firstChunk = new Uint8Array();
  const deadline = performance.now() + 3_000;
  while (!firstChunk.byteLength && performance.now() < deadline) {
    firstChunk = await readChunk();
    if (!firstChunk.byteLength) await wait(35);
  }
  if (!firstChunk.byteLength) {
    await invoke("stop_process_audio_capture").catch(() => undefined);
    throw new Error(
      "Nenhum áudio foi detectado. Inicie um som no aplicativo escolhido e tente novamente.",
    );
  }

  const context = new AudioContext({
    sampleRate: 48_000,
    latencyHint: "interactive",
  });
  await context.resume();
  const destination = context.createMediaStreamDestination();
  let nextTime = schedulePcm(
    context,
    destination,
    firstChunk,
    context.currentTime + 0.06,
  );
  let stopped = false;
  let reading = false;

  const timer = window.setInterval(() => {
    if (stopped || reading) return;
    reading = true;
    void readChunk()
      .then((chunk) => {
        if (!stopped && chunk.byteLength)
          nextTime = schedulePcm(context, destination, chunk, nextTime);
      })
      .catch(() => undefined)
      .finally(() => {
        reading = false;
      });
  }, 12);

  return {
    stream: destination.stream,
    async stop() {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      destination.stream.getTracks().forEach((track) => track.stop());
      await invoke("stop_process_audio_capture").catch(() => undefined);
      await context.close().catch(() => undefined);
    },
  };
}

export const windowsNativeCapture: NativeCaptureBridge = {
  platformLabel: "Windows 11",
  listSources: () => invoke<NativeCaptureSource[]>("list_capture_sources"),
  startProcessAudio,
};
