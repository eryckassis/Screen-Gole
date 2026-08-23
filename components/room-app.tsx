"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppWindow,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Expand,
  Monitor,
  MonitorUp,
  PanelsTopLeft,
  Radio,
  Search,
  Settings2,
  Signal,
  Volume2,
  VolumeX,
  Users,
  Wifi,
  X,
} from "lucide-react";

const roomId = "main";
const peerId =
  typeof window === "undefined"
    ? ""
    : sessionStorage.getItem("room-peer") || crypto.randomUUID();
if (typeof window !== "undefined") sessionStorage.setItem("room-peer", peerId);

type SignalType = "offer" | "answer" | "ice";
type SignalRow =
  | {
      id: number;
      fromPeerId: string;
      signalType: "offer" | "answer";
      payload: RTCSessionDescriptionInit;
    }
  | {
      id: number;
      fromPeerId: string;
      signalType: "ice";
      payload: RTCIceCandidateInit;
    };
type Profile = { name: string; avatar: string };
type SessionPayload = {
  roomId: string;
  isLive: boolean;
  host: { peerId: string; role: string; displayName: string } | null;
  peers: { peerId: string; role: string; displayName: string }[];
};
type SignalsPayload = { signals: SignalRow[] };

async function readJson<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim())
    throw new Error(`Resposta vazia da API (${response.status})`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Resposta inválida da API (${response.status})`);
  }
}

async function api<T = unknown>(
  apiBaseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const payload = await readJson<T>(response);
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Falha ${response.status} em ${path}`;
    throw new Error(message);
  }
  return payload;
}

export type RoomMode = "host" | "viewer";

export type NativeCaptureSource = {
  id: string;
  kind: "screen" | "window";
  name: string;
  processName?: string;
  processId?: number;
  width: number;
  height: number;
  audioCapable: boolean;
};

export type NativeAudioSession = {
  stream: MediaStream;
  stop: () => Promise<void>;
};

export type NativeCaptureBridge = {
  platformLabel: string;
  listSources: () => Promise<NativeCaptureSource[]>;
  startProcessAudio: (processId: number) => Promise<NativeAudioSession>;
};

export type RoomAppProps = {
  apiBaseUrl?: string;
  initialMode?: RoomMode;
  inviteUrl?: string;
  nativeCapture?: NativeCaptureBridge;
};

export function RoomApp({
  apiBaseUrl = "",
  initialMode,
  inviteUrl,
  nativeCapture,
}: RoomAppProps) {
  const normalizedApiBaseUrl = useMemo(
    () => apiBaseUrl.replace(/\/$/, ""),
    [apiBaseUrl],
  );
  const viewer = useMemo(
    () =>
      initialMode === "viewer" ||
      (initialMode === undefined &&
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("watch")),
    [initialMode],
  );
  const [joined, setJoined] = useState(!viewer);
  const [profile, setProfile] = useState<Profile>({ name: "", avatar: "" });
  const [draft, setDraft] = useState<Profile>(profile);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(true);
  const [sourceKind, setSourceKind] = useState<"screen" | "window" | "tab">(
    "screen",
  );
  const [sourceSearch, setSourceSearch] = useState("");
  const [nativeSources, setNativeSources] = useState<NativeCaptureSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [status, setStatus] = useState(
    viewer ? "Aguardando transmissão" : "Pronto para transmitir",
  );
  const [quality, setQuality] = useState("1080p · 60 FPS solicitado");
  const [qualityPreset, setQualityPreset] = useState<"1080p" | "720p" | "480p">(
    "1080p",
  );
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutput, setAudioOutput] = useState("default");
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [viewers, setViewers] = useState<
    { peerId: string; displayName: string }[]
  >([]);
  const [copied, setCopied] = useState(false);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeAudioRef = useRef<NativeAudioSession | null>(null);
  const connections = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const cursor = useRef(0);
  const pollBusy = useRef(false);

  const sendSignal = useCallback(
    async (toPeerId: string, type: SignalType, payload: unknown) => {
      await api(normalizedApiBaseUrl, "/api/room/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          fromPeerId: peerId,
          toPeerId,
          type,
          payload,
        }),
      });
    },
    [normalizedApiBaseUrl],
  );

  const applyPendingIce = useCallback(
    async (id: string, pc: RTCPeerConnection) => {
      const queued = pendingIce.current.get(id) || [];
      pendingIce.current.delete(id);
      for (const candidate of queued) await pc.addIceCandidate(candidate);
    },
    [],
  );

  const attachStreamAndRenegotiate = useCallback(
    async (
      pc: RTCPeerConnection,
      targetId: string,
      stream: MediaStream,
      negotiate = true,
    ) => {
      const currentTracks = new Set(stream.getTracks());
      for (const sender of pc.getSenders()) {
        if (sender.track && !currentTracks.has(sender.track))
          await sender.replaceTrack(null);
      }
      const senders = new Set(
        pc
          .getSenders()
          .map((sender) => sender.track)
          .filter(Boolean),
      );
      for (const track of stream.getTracks()) {
        if (!senders.has(track)) pc.addTrack(track, stream);
      }
      if (negotiate) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(targetId, "offer", offer);
      }
    },
    [sendSignal],
  );

  const connectViewer = useCallback(
    async (hostId: string) => {
      if (connections.current.has(hostId)) return;
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      connections.current.set(hostId, pc);
      pc.onicecandidate = (event) => {
        if (event.candidate)
          void sendSignal(hostId, "ice", event.candidate.toJSON());
      };
      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (remoteVideo.current && stream) {
          remoteVideo.current.srcObject = stream;
          void remoteVideo.current
            .play()
            .then(() => setPlaybackBlocked(false))
            .catch(() => setPlaybackBlocked(true));
        }
        setStatus("Ao vivo");
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed")
          setStatus("Conexão falhou — tentando novamente");
      };
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);
      await sendSignal(hostId, "offer", offer);
      setStatus("Conectando ao host");
    },
    [sendSignal],
  );

  const poll = useCallback(async () => {
    if (pollBusy.current) return;
    pollBusy.current = true;
    try {
      const session = await api<SessionPayload>(
        normalizedApiBaseUrl,
        "/api/room/session",
      );
      setViewers(session.peers || []);
      if (
        viewer &&
        session.isLive &&
        session.host &&
        session.host.peerId !== peerId
      )
        await connectViewer(session.host.peerId);
      const data = await api<SignalsPayload>(
        normalizedApiBaseUrl,
        `/api/room/signals?roomId=${roomId}&peerId=${peerId}&after=${cursor.current}`,
      );
      for (const signal of (data.signals || []) as SignalRow[]) {
        cursor.current = Math.max(cursor.current, signal.id);
        if (signal.signalType === "ice") {
          const pc = connections.current.get(signal.fromPeerId);
          if (!pc || !pc.remoteDescription) {
            const list = pendingIce.current.get(signal.fromPeerId) || [];
            list.push(signal.payload as RTCIceCandidateInit);
            pendingIce.current.set(signal.fromPeerId, list);
          } else
            await pc.addIceCandidate(signal.payload as RTCIceCandidateInit);
          continue;
        }
        if (viewer && signal.signalType === "offer") {
          const pc = connections.current.get(signal.fromPeerId);
          if (pc) {
            await pc.setRemoteDescription(signal.payload);
            await applyPendingIce(signal.fromPeerId, pc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal(signal.fromPeerId, "answer", answer);
          }
        }
        if (viewer && signal.signalType === "answer") {
          const pc = connections.current.get(signal.fromPeerId);
          if (pc && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription(signal.payload);
            await applyPendingIce(signal.fromPeerId, pc);
          }
        }
        if (!viewer && signal.signalType === "offer") {
          let pc = connections.current.get(signal.fromPeerId);
          if (!pc) {
            pc = new RTCPeerConnection({
              iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            });
            connections.current.set(signal.fromPeerId, pc);
            pc.onicecandidate = (event) => {
              if (event.candidate)
                void sendSignal(
                  signal.fromPeerId,
                  "ice",
                  event.candidate.toJSON(),
                );
            };
          }
          await pc.setRemoteDescription(signal.payload);
          if (streamRef.current)
            await attachStreamAndRenegotiate(
              pc,
              signal.fromPeerId,
              streamRef.current,
              false,
            );
          await applyPendingIce(signal.fromPeerId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(signal.fromPeerId, "answer", answer);
        }
      }
    } catch (error) {
      setStatus("Sinalização indisponível — tentando novamente");
    } finally {
      pollBusy.current = false;
    }
  }, [
    applyPendingIce,
    attachStreamAndRenegotiate,
    connectViewer,
    normalizedApiBaseUrl,
    sendSignal,
    viewer,
  ]);

  const loadNativeSources = useCallback(async () => {
    if (!nativeCapture || viewer) return;
    setSourcesLoading(true);
    setSourceError("");
    try {
      const sources = await nativeCapture.listSources();
      setNativeSources(sources);
      setSelectedSourceId((current) =>
        current && sources.some((source) => source.id === current)
          ? current
          : sources.find((source) => source.kind === sourceKind)?.id || null,
      );
    } catch (error) {
      setSourceError(
        error instanceof Error
          ? error.message
          : "Não foi possível listar as fontes do Windows",
      );
    } finally {
      setSourcesLoading(false);
    }
  }, [nativeCapture, sourceKind, viewer]);

  useEffect(() => {
    if (sourcePickerOpen) void loadNativeSources();
  }, [loadNativeSources, sourcePickerOpen]);

  useEffect(() => {
    if (!joined) return;
    void loadAudioOutputs();
    const handleDeviceChange = () => void loadAudioOutputs();
    navigator.mediaDevices?.addEventListener(
      "devicechange",
      handleDeviceChange,
    );
    return () =>
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
  }, [joined]);

  useEffect(() => {
    if (!joined) return;
    void api(normalizedApiBaseUrl, "/api/room/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: viewer ? "viewer" : "host",
        peerId,
        displayName: profile.name || "Espectador",
      }),
    }).catch(() => {
      setStatus("Não foi possível entrar na sala");
    });
    void poll();
    const timer = window.setInterval(() => {
      void poll();
      void api(normalizedApiBaseUrl, "/api/room/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerId,
          role: viewer ? "viewer" : "host",
          live: sharing,
        }),
      }).catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [joined, normalizedApiBaseUrl, poll, profile.name, sharing, viewer]);

  async function startShare(kind: "screen" | "window" | "tab" = sourceKind) {
    let displayStream: MediaStream | null = null;
    let nativeAudio: NativeAudioSession | null = null;
    try {
      const selectedSource = nativeSources.find(
        (source) => source.id === selectedSourceId,
      );
      const useNativeProcessAudio = Boolean(
        nativeCapture && kind === "window" && selectedSource?.processId,
      );
      if (nativeCapture && kind === "window" && !selectedSource?.processId) {
        throw new Error(
          "Selecione uma janela real do Windows antes de continuar",
        );
      }
      setSourcePickerOpen(false);
      setStatus("Aguardando seleção do Windows");
      const displaySurface =
        kind === "window" ? "window" : kind === "tab" ? "browser" : "monitor";
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface,
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 60, max: 60 },
        } as MediaTrackConstraints,
        audio: useNativeProcessAudio
          ? false
          : ({
              channelCount: 2,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            } as MediaTrackConstraints),
      });
      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("Nenhuma fonte de vídeo selecionada");

      let stream = displayStream;
      if (useNativeProcessAudio && selectedSource?.processId && nativeCapture) {
        setStatus(
          `Detectando áudio de ${selectedSource.processName || selectedSource.name}`,
        );
        nativeAudio = await nativeCapture.startProcessAudio(
          selectedSource.processId,
        );
        const nativeTrack = nativeAudio.stream.getAudioTracks()[0];
        if (!nativeTrack)
          throw new Error(
            "O Windows não entregou uma faixa de áudio para esta janela",
          );
        stream = new MediaStream([videoTrack, nativeTrack]);
      }

      if (!stream.getAudioTracks().length) {
        throw new Error(
          kind === "tab"
            ? "Áudio obrigatório: marque “Compartilhar áudio da aba” no seletor e tente novamente."
            : "Áudio obrigatório: esta fonte não forneceu som. Ative “Compartilhar áudio” e tente novamente.",
        );
      }

      nativeAudioRef.current = nativeAudio;
      streamRef.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;
      const track = videoTrack;
      const settings = track.getSettings();
      setQuality(
        `${settings.width || 0}×${settings.height || 0} · ${settings.frameRate ? Math.round(settings.frameRate) : "?"} FPS efetivo`,
      );
      setSharing(true);
      setStatus(
        useNativeProcessAudio
          ? "Ao vivo · áudio isolado do aplicativo"
          : "Ao vivo · áudio ativo",
      );
      for (const [targetId, pc] of connections.current)
        await attachStreamAndRenegotiate(pc, targetId, stream);
      track.onended = stopShare;
      for (const audioTrack of stream.getAudioTracks())
        audioTrack.onended = () =>
          setStatus("Ao vivo · áudio encerrado pelo sistema");
    } catch (error) {
      displayStream?.getTracks().forEach((track) => track.stop());
      if (nativeAudio) await nativeAudio.stop();
      setSourcePickerOpen(true);
      setStatus(
        error instanceof Error
          ? error.message
          : "Captura cancelada — tente novamente",
      );
    }
  }
  function stopShare() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (nativeAudioRef.current) {
      void nativeAudioRef.current.stop();
      nativeAudioRef.current = null;
    }
    if (localVideo.current) localVideo.current.srcObject = null;
    setSharing(false);
    setStatus("Transmissão encerrada");
  }
  async function setVideoQuality(preset: "1080p" | "720p" | "480p") {
    setQualityPreset(preset);
    const heights = { "1080p": 1080, "720p": 720, "480p": 480 } as const;
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({
          width: {
            ideal: preset === "1080p" ? 1920 : preset === "720p" ? 1280 : 854,
          },
          height: { ideal: heights[preset] },
          frameRate: { ideal: 60, max: 60 },
        });
      } catch {
        setStatus("Qualidade não suportada — usando fallback");
      }
    }
    setQuality(`${preset} · 60 FPS preferido`);
  }
  function toggleFullscreen() {
    const target = document.querySelector(".screen-preview");
    if (!document.fullscreenElement) void target?.requestFullscreen();
    else void document.exitFullscreen();
  }
  function updatePlayback(video: HTMLVideoElement | null) {
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }
  async function loadAudioOutputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    setAudioOutputs(devices.filter((device) => device.kind === "audiooutput"));
  }
  async function changeAudioOutput(deviceId: string) {
    setAudioOutput(deviceId);
    const video = remoteVideo.current;
    if (!video || !("setSinkId" in video)) return;
    try {
      await (
        video as HTMLVideoElement & { setSinkId: (id: string) => Promise<void> }
      ).setSinkId(deviceId);
    } catch {
      setStatus("Saída de áudio não suportada neste navegador");
    }
  }
  async function enablePlayback() {
    const video = remoteVideo.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    try {
      await video.play();
      setPlaybackBlocked(false);
    } catch {
      setStatus("O Windows bloqueou a reprodução — clique novamente");
    }
  }
  async function copyInvite() {
    await navigator.clipboard?.writeText(
      inviteUrl || `${window.location.origin}/?watch=1`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  function saveProfile() {
    setProfile(draft);
    setEditing(false);
  }
  function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || file.size > 2_000_000) return;
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((p) => ({ ...p, avatar: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  const visibleNativeSources = nativeSources.filter((source) => {
    const matchesKind = source.kind === sourceKind;
    const query = sourceSearch.trim().toLocaleLowerCase("pt-BR");
    return (
      matchesKind &&
      (!query ||
        `${source.name} ${source.processName || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(query))
    );
  });
  const nativeSelectionRequired = Boolean(
    nativeCapture && sourceKind !== "tab",
  );

  if (viewer && !joined)
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
        <section className="w-full max-w-md border border-border bg-card p-8">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            sala fixa · acesso livre
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight">
            Assistir à transmissão
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            Entre sem conta. Seu nome e imagem aparecem apenas para o host.
          </p>
          <ProfileEditor
            profile={draft}
            setProfile={setDraft}
            uploadAvatar={uploadAvatar}
          />
          <button
            onClick={() => setJoined(true)}
            className="mt-6 min-h-11 w-full bg-foreground px-4 py-3 font-semibold text-background"
          >
            Entrar para assistir
          </button>
        </section>
      </main>
    );

  return (
    <main className="min-h-dvh bg-background text-foreground">
      {!viewer && sourcePickerOpen && !sharing && (
        <div
          className="source-picker-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="source-picker-title"
        >
          <section className="source-picker">
            <div className="source-picker-head">
              <div>
                <p className="source-kicker">Neegy Studio · Captura desktop</p>
                <h2 id="source-picker-title">Escolha o que transmitir</h2>
                <p>
                  {nativeCapture
                    ? `Fontes reais detectadas no ${nativeCapture.platformLabel}.`
                    : "Selecione uma fonte e ative o áudio no próximo passo."}
                </p>
              </div>
              <button
                className="modal-close"
                onClick={() => setSourcePickerOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <label className="source-search">
              <Search size={16} />
              <input
                value={sourceSearch}
                onChange={(event) => setSourceSearch(event.target.value)}
                placeholder="Buscar janela ou aplicativo"
                aria-label="Buscar fonte"
              />
            </label>
            <div className="source-tabs" role="tablist">
              {(
                [
                  ["screen", Monitor, "Telas"],
                  ["window", AppWindow, "Janelas"],
                  ["tab", PanelsTopLeft, "Abas"],
                ] as const
              ).map(([kind, Icon, label]) => (
                <button
                  key={kind}
                  role="tab"
                  aria-selected={sourceKind === kind}
                  className={sourceKind === kind ? "active" : ""}
                  onClick={() => {
                    setSourceKind(kind);
                    setSelectedSourceId(
                      nativeSources.find((source) => source.kind === kind)
                        ?.id || null,
                    );
                  }}
                >
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </div>
            <div className="source-list">
              {sourcesLoading && (
                <p className="source-empty">Lendo fontes do Windows…</p>
              )}
              {sourceError && <p className="source-error">{sourceError}</p>}
              {nativeCapture &&
                sourceKind !== "tab" &&
                !sourcesLoading &&
                visibleNativeSources.map((source) => (
                  <button
                    key={source.id}
                    className={`source-card ${selectedSourceId === source.id ? "selected" : ""}`}
                    onClick={() => setSelectedSourceId(source.id)}
                  >
                    <span className="source-thumb">
                      {source.kind === "screen" ? (
                        <Monitor size={22} />
                      ) : (
                        <AppWindow size={22} />
                      )}
                    </span>
                    <span>
                      <strong>{source.name}</strong>
                      <small>
                        {source.processName ? `${source.processName} · ` : ""}
                        {source.width}×{source.height}
                        {source.audioCapable ? " · áudio isolado" : ""}
                      </small>
                    </span>
                    {selectedSourceId === source.id && (
                      <CheckCircle2 className="source-check" size={19} />
                    )}
                  </button>
                ))}
              {nativeCapture &&
                sourceKind !== "tab" &&
                !sourcesLoading &&
                !visibleNativeSources.length &&
                !sourceError && (
                  <p className="source-empty">
                    Nenhuma fonte correspondente foi encontrada.
                  </p>
                )}
              {(!nativeCapture || sourceKind === "tab") && (
                <button
                  className="source-card selected"
                  onClick={() => setSelectedSourceId(null)}
                >
                  <span className="source-thumb">
                    <MonitorUp size={22} />
                  </span>
                  <span>
                    <strong>
                      {sourceKind === "screen"
                        ? "Sua tela inteira"
                        : sourceKind === "window"
                          ? "Uma janela do aplicativo"
                          : "Uma aba do navegador"}
                    </strong>
                    <small>
                      {sourceKind === "tab" && nativeCapture
                        ? "A aba será escolhida no seletor seguro do WebView2"
                        : "Captura de vídeo em alta qualidade"}
                    </small>
                  </span>
                  <CheckCircle2 className="source-check" size={19} />
                </button>
              )}
            </div>
            <div className="source-audio-note">
              <Volume2 size={17} />
              <span>
                <strong>
                  {sourceKind === "window" && nativeCapture
                    ? "Áudio isolado por aplicativo"
                    : "Áudio obrigatório"}
                </strong>
                <small>
                  {sourceKind === "window" && nativeCapture
                    ? "O Windows 11 captura somente o processo escolhido e não recaptura o Screen Gole."
                    : "No seletor do Windows, habilite o compartilhamento de áudio; sem uma faixa audível a transmissão não começa."}
                </small>
              </span>
            </div>
            <button
              className="primary-action source-confirm"
              disabled={
                sourcesLoading || (nativeSelectionRequired && !selectedSourceId)
              }
              onClick={() => void startShare(sourceKind)}
            >
              Continuar com esta fonte
            </button>
          </section>
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center bg-foreground text-background">
            <Radio size={21} />
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Neegy Studio
            </p>
            <h1 className="font-semibold">Sala principal</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Wifi size={16} />
            {status}
          </span>
          <button
            onClick={() => {
              setDraft(profile);
              setEditing(true);
            }}
            className="flex min-h-11 items-center gap-2 border border-border px-4 hover:bg-muted"
          >
            <Settings2 size={16} />
            Perfil
          </button>
          <button
            onClick={copyInvite}
            className="flex min-h-11 items-center gap-2 border border-border px-4 hover:bg-muted"
          >
            {copied ? "Link copiado" : "Copiar convite"}
            <Copy size={16} />
          </button>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:flex-row">
        <section className="min-w-0 flex-1">
          <div className="relative aspect-video overflow-hidden border border-border bg-card">
            <video
              ref={viewer ? remoteVideo : localVideo}
              autoPlay
              muted={viewer ? muted : true}
              playsInline
              className="h-full w-full object-contain"
              aria-label={
                viewer ? "Transmissão da tela do host" : "Prévia da sua tela"
              }
              onLoadedMetadata={(event) => updatePlayback(event.currentTarget)}
            />
            <div
              className="media-toolbar"
              role="group"
              aria-label="Controles da transmissão"
            >
              <button
                type="button"
                className="media-button"
                onClick={() => {
                  setMuted((value) => !value);
                  if (remoteVideo.current) remoteVideo.current.muted = !muted;
                }}
                aria-label={muted ? "Ativar som" : "Mutar som"}
                title={muted ? "Ativar som" : "Mutar som"}
              >
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <label className="volume-control">
                <span className="sr-only">Volume</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setVolume(next);
                    if (remoteVideo.current) remoteVideo.current.volume = next;
                  }}
                />
              </label>
              <button
                type="button"
                className="media-button"
                onClick={toggleFullscreen}
                aria-label="Tela cheia"
                title="Tela cheia"
              >
                <Expand size={17} />
              </button>
              <label className="audio-output-control">
                <span>Áudio</span>
                <select
                  aria-label="Saída de áudio"
                  value={audioOutput}
                  onChange={(event) =>
                    void changeAudioOutput(event.target.value)
                  }
                >
                  <option value="default">Padrão</option>
                  {audioOutputs
                    .filter((device) => device.deviceId !== "default")
                    .map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label ||
                          `Dispositivo ${device.deviceId.slice(0, 4)}`}
                      </option>
                    ))}
                </select>
              </label>
              <div
                className="quality-controls"
                role="group"
                aria-label="Qualidade da transmissão"
              >
                <span>Qualidade</span>
                {(["1080p", "720p", "480p"] as const).map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    className={`quality-button ${qualityPreset === preset ? "selected" : ""}`}
                    onClick={() => void setVideoQuality(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            {!sharing && !viewer && (
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <MonitorUp size={36} className="mx-auto mb-4" />
                  <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
                    {status}
                  </p>
                </div>
              </div>
            )}
            {viewer && status !== "Ao vivo" && (
              <div className="absolute inset-0 grid place-items-center bg-card text-center">
                <div>
                  <Signal size={32} className="mx-auto mb-4" />
                  <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
                    {status}
                  </p>
                </div>
              </div>
            )}
            {viewer && playbackBlocked && (
              <div className="playback-consent">
                <Volume2 size={22} />
                <strong>Ativar o áudio da transmissão</strong>
                <small>
                  O Windows/WebView2 precisa de um clique para liberar o som.
                </small>
                <button type="button" onClick={() => void enablePlayback()}>
                  Ativar áudio
                </button>
              </div>
            )}
            <div className="absolute left-4 top-4 flex items-center gap-2 bg-background/90 px-3 py-2 font-mono text-xs">
              <Signal size={14} />
              {quality}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-border bg-card p-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {viewer ? "modo espectador" : "modo host"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {viewer
                  ? "A conexão é estabelecida automaticamente."
                  : "Compartilhe uma janela para iniciar."}
              </p>
            </div>
            {!viewer && (
              <button
                onClick={() => {
                  if (sharing) stopShare();
                  else void startShare();
                }}
                className="min-h-11 bg-foreground px-5 py-3 font-semibold text-background"
              >
                {sharing ? "Encerrar transmissão" : "Compartilhar tela"}
              </button>
            )}
          </div>
        </section>
        <aside className="w-full border border-border bg-card p-5 lg:w-72">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Pessoas na sala</h2>
            <Users size={18} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {viewers.length} espectador{viewers.length === 1 ? "" : "es"}
          </p>
          <div className="mt-5 space-y-3">
            {viewers.map((item) => (
              <div
                key={item.peerId}
                className="flex items-center gap-3 text-sm"
              >
                <div className="grid h-8 w-8 place-items-center rounded-full bg-muted font-medium">
                  {item.displayName.slice(0, 1).toUpperCase()}
                </div>
                {item.displayName}
              </div>
            ))}
          </div>
        </aside>
      </div>
      {editing && (
        <div className="fixed inset-0 z-10 grid place-items-center bg-background/80 p-6">
          <div className="w-full max-w-md border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Editar perfil</h2>
              <button aria-label="Fechar" onClick={() => setEditing(false)}>
                <X size={20} />
              </button>
            </div>
            <ProfileEditor
              profile={draft}
              setProfile={setDraft}
              uploadAvatar={uploadAvatar}
            />
            <button
              onClick={saveProfile}
              className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 bg-foreground px-4 py-3 font-semibold text-background"
            >
              <Check size={16} />
              Salvar perfil
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ProfileEditor({
  profile,
  setProfile,
  uploadAvatar,
}: {
  profile: Profile;
  setProfile: React.Dispatch<React.SetStateAction<Profile>>;
  uploadAvatar: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="mt-7 space-y-5">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border border-border bg-muted">
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt="Prévia do avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <Camera size={22} />
          )}
        </div>
        <label className="cursor-pointer border border-border px-4 py-2 text-sm hover:bg-muted">
          Adicionar imagem
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={uploadAvatar}
          />
        </label>
      </div>
      <label className="block text-sm font-medium" htmlFor="profile-name">
        Nome
        <input
          id="profile-name"
          value={profile.name}
          onChange={(event) =>
            setProfile((p) => ({ ...p, name: event.target.value }))
          }
          maxLength={32}
          className="mt-2 min-h-11 w-full border border-border bg-background px-4 outline-none focus:ring-2 focus:ring-foreground"
          placeholder="Seu nome"
        />
      </label>
    </div>
  );
}
