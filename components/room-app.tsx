"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import {
  AppWindow,
  Camera,
  CheckCircle2,
  ChevronDown,
  Copy,
  Expand,
  Hash,
  ImagePlus,
  Monitor,
  MonitorUp,
  PanelsTopLeft,
  Radio,
  Search,
  Settings2,
  Signal,
  Volume2,
  VolumeX,
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
type ChannelProfile = {
  roomId: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  avatar: string | null;
};
type ChannelPayload = { channel: ChannelProfile };
const defaultChannel: ChannelProfile = {
  roomId,
  slug: "main",
  name: "Mesa Principal",
  category: "Transmissões",
  description: "Canal principal da comunidade",
  avatar: null,
};
const footerIconButtonClass =
  "grid size-11 shrink-0 place-items-center rounded-md border border-transparent bg-[#323234] text-white transition-colors hover:bg-[#5a595c] hover:text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white";
const footerSelectClass =
  "min-h-11 w-[clamp(110px,10vw,160px)] cursor-pointer appearance-none rounded-md border border-transparent bg-[#323234] py-0 pr-9 pl-3 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[#5a595c] focus:border-transparent focus:ring-2 focus:ring-white/25";
const footerQualityButtonClass =
  "min-h-11 min-w-14 rounded-md border px-3 text-[13px] font-extrabold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white";
const footerShareButtonClass =
  "flex min-h-11 min-w-[170px] shrink-0 items-center justify-center gap-2 rounded-md border border-transparent px-4 text-[13px] font-extrabold whitespace-nowrap transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white";
const sourceTabButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1b1b]";
const sourceCardButtonClass =
  "flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1b1b]";
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
  setNativeFullscreen?: (fullscreen: boolean) => Promise<void>;
};

export function RoomApp({
  apiBaseUrl = "",
  initialMode,
  inviteUrl,
  nativeCapture,
  setNativeFullscreen,
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
  const [channel, setChannel] = useState<ChannelProfile>(defaultChannel);
  const [channelDraft, setChannelDraft] =
    useState<ChannelProfile>(defaultChannel);
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [roomLive, setRoomLive] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
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
  const [mediaFullscreen, setMediaFullscreen] = useState(false);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const screenPreview = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeAudioRef = useRef<NativeAudioSession | null>(null);
  const connections = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const cursor = useRef(0);
  const pollBusy = useRef(false);

  useEffect(() => {
    const syncBrowserFullscreen = () => {
      if (!setNativeFullscreen)
        setMediaFullscreen(
          document.fullscreenElement === screenPreview.current,
        );
    };
    document.addEventListener("fullscreenchange", syncBrowserFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", syncBrowserFullscreen);
  }, [setNativeFullscreen]);

  useEffect(() => {
    if (!mediaFullscreen || !setNativeFullscreen) return;
    const exitWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMediaFullscreen(false);
      void setNativeFullscreen(false);
    };
    window.addEventListener("keydown", exitWithEscape);
    return () => window.removeEventListener("keydown", exitWithEscape);
  }, [mediaFullscreen, setNativeFullscreen]);

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
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          // Uma reconexão pode deixar candidatos da conexão anterior na fila.
        }
      }
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
        if (pc.connectionState === "connected") {
          setStatus("Ao vivo");
          return;
        }
        if (pc.connectionState === "failed") {
          connections.current.delete(hostId);
          pendingIce.current.delete(hostId);
          pc.close();
          setStatus("Conexão falhou — reconectando");
          return;
        }
        if (pc.connectionState === "disconnected") {
          setStatus("Conexão interrompida — reconectando");
          window.setTimeout(() => {
            if (pc.connectionState !== "disconnected") return;
            connections.current.delete(hostId);
            pendingIce.current.delete(hostId);
            pc.close();
          }, 2500);
        }
      };
      pc.onicecandidateerror = () =>
        setStatus("Rede restrita detectada — tentando rota alternativa");
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
      setRoomLive(session.isLive);
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
          } else {
            try {
              await pc.addIceCandidate(signal.payload as RTCIceCandidateInit);
            } catch {
              // Ignora candidatos atrasados pertencentes a uma conexão anterior.
            }
          }
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
            pc.onconnectionstatechange = () => {
              if (
                pc &&
                (pc.connectionState === "failed" ||
                  pc.connectionState === "closed")
              ) {
                connections.current.delete(signal.fromPeerId);
                pendingIce.current.delete(signal.fromPeerId);
              }
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

  const loadChannel = useCallback(async () => {
    try {
      const payload = await api<ChannelPayload>(
        normalizedApiBaseUrl,
        "/api/room/channel",
      );
      setChannel(payload.channel);
      setChannelDraft(payload.channel);
    } catch {
      // A configuração padrão mantém a sala utilizável durante uma retomada do banco.
    }
  }, [normalizedApiBaseUrl]);

  useEffect(() => {
    void loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    if (sourcePickerOpen) void loadNativeSources();
  }, [loadNativeSources, sourcePickerOpen]);

  useEffect(() => {
    if (!sourcePickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSourcePickerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sourcePickerOpen]);

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
    const heartbeat = () =>
      api(normalizedApiBaseUrl, "/api/room/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerId,
          role: viewer ? "viewer" : "host",
          live: sharing,
        }),
      }).catch(() => undefined);
    void heartbeat();
    void poll();
    const timer = window.setInterval(() => {
      void poll();
      void heartbeat();
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
  async function toggleFullscreen() {
    const nextFullscreen = !mediaFullscreen;

    if (setNativeFullscreen) {
      try {
        await setNativeFullscreen(nextFullscreen);
        setMediaFullscreen(nextFullscreen);
        return;
      } catch {
        setStatus(
          "Não foi possível alterar a janela — tentando modo compatível",
        );
      }
    }

    try {
      if (nextFullscreen) await screenPreview.current?.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      setStatus("Tela cheia não está disponível neste dispositivo");
    }
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
      inviteUrl || `${window.location.origin}/s/${channel.slug}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  async function saveChannel() {
    setChannelSaving(true);
    setChannelError("");
    try {
      const payload = await api<ChannelPayload>(
        normalizedApiBaseUrl,
        "/api/room/channel",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            peerId,
            name: channelDraft.name,
            category: channelDraft.category,
            description: channelDraft.description,
            avatar: channelDraft.avatar,
          }),
        },
      );
      setChannel(payload.channel);
      setChannelDraft(payload.channel);
      setChannelSettingsOpen(false);
    } catch (error) {
      setChannelError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o canal",
      );
    } finally {
      setChannelSaving(false);
    }
  }
  function uploadChannelAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 700_000) {
      setChannelError("Escolha uma imagem de até 700 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setChannelDraft((current) => ({
        ...current,
        avatar: String(reader.result),
      }));
    reader.readAsDataURL(file);
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
          <div className="welcome-channel-badge">
            {channel.avatar ? (
              <img src={channel.avatar} alt="" />
            ) : (
              <Radio size={22} />
            )}
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            {channel.category} · sala permanente
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight">
            {channel.name}
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            {channel.description}. Entre uma vez e salve esta sala nos
            favoritos.
          </p>
          <ProfileEditor
            profile={draft}
            setProfile={setDraft}
            uploadAvatar={uploadAvatar}
          />
          <button
            onClick={() => {
              setProfile(draft);
              setJoined(true);
            }}
            className="mt-6 min-h-11 w-full bg-foreground px-4 py-3 font-semibold text-background"
          >
            Entrar para assistir
          </button>
        </section>
      </main>
    );

  return (
    <main className="persistent-room-shell flex min-h-dvh flex-col bg-background text-foreground">
      {!viewer && sourcePickerOpen && !sharing && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-[#0b0b0b]/90 p-4 backdrop-blur-md sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setSourcePickerOpen(false);
          }}
        >
          <section
            className="my-auto w-full max-w-[680px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0b] shadow-[0_32px_100px_#000c]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-picker-title"
            aria-describedby="source-picker-description"
          >
            <header className="flex items-start justify-between gap-6 border-b border-white/8 px-5 py-6 sm:px-8 sm:py-7">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#c8c9ff]">
                  ODYSSEY · Captura desktop
                </p>
                <h2
                  id="source-picker-title"
                  className="mt-3 text-2xl font-bold tracking-[-0.03em] text-white sm:text-[28px]"
                >
                  Escolha o que transmitir
                </h2>
                <p
                  id="source-picker-description"
                  className="mt-2 max-w-[540px] text-sm leading-6 text-[#aaa8af] sm:text-[15px]"
                >
                  {nativeCapture
                    ? `Fontes reais detectadas no ${nativeCapture.platformLabel}.`
                    : "Selecione uma fonte e ative o áudio no próximo passo."}
                </p>
              </div>
              <button
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-[#0b0b0b] text-[#b9b7bd] transition-colors hover:border-white/20 hover:bg-[#29292b] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={() => setSourcePickerOpen(false)}
                aria-label="Fechar seletor de fonte"
              >
                <X size={20} />
              </button>
            </header>

            <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-7">
              <label className="flex min-h-12 items-center gap-3 rounded-xl border border-white/12 bg-[#0b0b0b] px-4 text-[#8f8d94] transition-colors focus-within:border-white/35 focus-within:ring-2 focus-within:ring-white/10">
                <Search className="shrink-0" size={18} />
                <input
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-[#74727a]"
                  value={sourceSearch}
                  onChange={(event) => setSourceSearch(event.target.value)}
                  placeholder="Buscar janela ou aplicativo"
                  aria-label="Buscar fonte"
                />
              </label>

              <div
                className="flex flex-wrap gap-2 border-b border-white/8 pb-4"
                role="tablist"
                aria-label="Tipo de fonte"
              >
                {(
                  [
                    ["screen", Monitor, "Telas"],
                    ["window", AppWindow, "Janelas"],
                    ["tab", PanelsTopLeft, "Abas"],
                  ] as const
                ).map(([kind, Icon, label]) => (
                  <button
                    type="button"
                    key={kind}
                    role="tab"
                    aria-selected={sourceKind === kind}
                    className={`${sourceTabButtonClass} ${sourceKind === kind ? "bg-[#353537] text-white" : "bg-transparent text-[#aaa8af] hover:bg-[#29292b] hover:text-white"}`}
                    onClick={() => {
                      setSourceKind(kind);
                      setSelectedSourceId(
                        nativeSources.find((source) => source.kind === kind)
                          ?.id || null,
                      );
                    }}
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                ))}
              </div>

              <div className="max-h-[min(34dvh,320px)] space-y-3 overflow-y-auto pr-1">
                {sourcesLoading && (
                  <p className="rounded-xl border border-dashed border-white/15 bg-[#0b0b0b] p-5 text-center text-sm text-[#aaa8af]">
                    Lendo fontes do Windows…
                  </p>
                )}
                {sourceError && (
                  <p
                    className="rounded-xl border border-[#8a444b] bg-[#2a1518] p-4 text-sm leading-6 text-[#ffadb3]"
                    role="alert"
                  >
                    {sourceError}
                  </p>
                )}
                {nativeCapture &&
                  sourceKind !== "tab" &&
                  !sourcesLoading &&
                  visibleNativeSources.map((source) => (
                    <button
                      type="button"
                      key={source.id}
                      className={`${sourceCardButtonClass} ${selectedSourceId === source.id ? "border-white/35 bg-[#29292b]" : "border-white/10 bg-[#0b0b0b] hover:border-white/20 hover:bg-[#121212]"}`}
                      onClick={() => setSelectedSourceId(source.id)}
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-white/8 bg-[#1b1b1b] text-white">
                        {source.kind === "screen" ? (
                          <Monitor size={22} />
                        ) : (
                          <AppWindow size={22} />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <strong className="truncate text-sm font-bold text-white">
                          {source.name}
                        </strong>
                        <small className="truncate text-xs leading-5 text-[#97959d]">
                          {source.processName ? `${source.processName} · ` : ""}
                          {source.width}×{source.height}
                          {source.audioCapable ? " · áudio isolado" : ""}
                        </small>
                      </span>
                      {selectedSourceId === source.id && (
                        <CheckCircle2
                          className="shrink-0 text-[#6ee7a0]"
                          size={20}
                        />
                      )}
                    </button>
                  ))}
                {nativeCapture &&
                  sourceKind !== "tab" &&
                  !sourcesLoading &&
                  !visibleNativeSources.length &&
                  !sourceError && (
                    <p className="rounded-xl border border-dashed border-white/15 bg-[#0b0b0b] p-5 text-center text-sm text-[#aaa8af]">
                      Nenhuma fonte correspondente foi encontrada.
                    </p>
                  )}
                {(!nativeCapture || sourceKind === "tab") && (
                  <button
                    type="button"
                    className={`${sourceCardButtonClass} border-[#1b1b1b] bg-[#0b0b0b]`}
                    onClick={() => setSelectedSourceId(null)}
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-transparent bg-[#0b0b0b] text-white">
                      <MonitorUp size={22} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <strong className="truncate text-sm font-bold text-white">
                        {sourceKind === "screen"
                          ? "Sua tela inteira"
                          : sourceKind === "window"
                            ? "Uma janela do aplicativo"
                            : "Uma aba do navegador"}
                      </strong>
                      <small className="truncate text-xs leading-5 text-[#aaa8af]">
                        {sourceKind === "tab" && nativeCapture
                          ? "A aba será escolhida no seletor seguro do WebView2"
                          : "Captura de vídeo em alta qualidade"}
                      </small>
                    </span>
                    <CheckCircle2
                      className="shrink-0 text-[#6ee7a0]"
                      size={20}
                    />
                  </button>
                )}
              </div>

              <aside className="flex gap-3 rounded-xl border border-white/10 bg-[#0b0b0b] p-4 sm:p-5">
                <Volume2 className="mt-0.5 shrink-0 text-white" size={20} />
                <div className="min-w-0">
                  <strong className="block text-sm font-bold text-white">
                    {sourceKind === "window" && nativeCapture
                      ? "Áudio isolado por aplicativo"
                      : "Áudio obrigatório"}
                  </strong>
                  <p className="mt-1.5 text-xs leading-5 text-[#aaa8af]">
                    {sourceKind === "window" && nativeCapture
                      ? "O Windows 11 captura somente o processo escolhido e não recaptura o Screen Gole."
                      : "No seletor do Windows, habilite o compartilhamento de áudio; sem uma faixa audível a transmissão não começa."}
                  </p>
                </div>
              </aside>

              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-5 text-sm  text-[#0b0b0b] transition-colors hover:bg-[#dedede] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1b1b] disabled:pointer-events-none disabled:opacity-40"
                disabled={
                  sourcesLoading ||
                  (nativeSelectionRequired && !selectedSourceId)
                }
                onClick={() => void startShare(sourceKind)}
              >
                Continuar com esta fonte
              </button>
            </div>
          </section>
        </div>
      )}
      <ChannelSidebar
        channel={channel}
        viewer={viewer}
        sharing={viewer ? roomLive : sharing}
        viewers={viewers}
        copied={copied}
        onCopyInvite={() => void copyInvite()}
        onEdit={() => {
          setChannelDraft(channel);
          setChannelError("");
          setChannelSettingsOpen(true);
        }}
      />
      <header className="room-topbar">
        <div className="room-brand">
          <div className="grid size-15 shrink-0 place-items-center overflow-hidden rounded-md border border-white/10  ">
            <img
              src="/odyssey-helmet.png"
              alt="Símbolo da Odyssey Studio"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
              ODYSSEY Studio
            </p>
            <h1 className="font-semibold">{channel.name}</h1>
          </div>
        </div>
        <div className="room-topbar-actions">
          <span className="room-connection-status">
            <Wifi size={16} />
            {status}
          </span>
          <button
            onClick={copyInvite}
            className="flex min-h-11 items-center gap-2 border border-border px-4 hover:bg-muted"
          >
            {copied ? "Link copiado" : "Copiar convite"}
            <Copy size={16} />
          </button>
        </div>
      </header>
      <div className="flex w-full flex-1 p-3 sm:p-4 lg:p-5">
        <section className="flex min-w-0 w-full">
          <div className="flex min-h-0 w-full flex-col rounded-lg bg-[#1b1b1b] p-2 pb-0 shadow-[0_24px_70px_#0005]">
            <div
              ref={screenPreview}
              className={`relative h-[calc(100dvh-188px)] min-h-[360px] w-full flex-1 overflow-hidden bg-[#0b0b0b] [&:fullscreen]:fixed [&:fullscreen]:inset-0 [&:fullscreen]:z-[100] [&:fullscreen]:h-dvh [&:fullscreen]:w-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-[#050506] ${mediaFullscreen ? "fixed inset-0 z-[100] h-dvh w-screen rounded-none border-0 bg-[#050506]" : "rounded-[7px]"}`}
            >
              <video
                ref={viewer ? remoteVideo : localVideo}
                autoPlay
                muted={viewer ? muted : true}
                playsInline
                className="h-full w-full object-contain"
                aria-label={
                  viewer ? "Transmissão da tela do host" : "Prévia da sua tela"
                }
                onLoadedMetadata={(event) =>
                  updatePlayback(event.currentTarget)
                }
              />
              {!sharing && !viewer && (
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <ThinkingOrb
                      state="composing"
                      size={64}
                      theme="dark"
                      className="mx-auto mb-4"
                      aria-label="Pronto para transmitir"
                    />
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
              {mediaFullscreen && (
                <button
                  type="button"
                  className="absolute top-4 right-4 z-[110] flex min-h-10 items-center gap-2 rounded-md border border-[#5a5663] bg-[#111014e8] px-3 text-[11px] font-bold text-[#f4f3f6] backdrop-blur-md transition-colors hover:bg-[#29272f] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#8e91ff]"
                  onClick={() => void toggleFullscreen()}
                  aria-label="Sair da tela cheia"
                  title="Sair da tela cheia (Esc)"
                >
                  <X size={20} />
                  <span className="max-[480px]:hidden">Sair da tela cheia</span>
                </button>
              )}
            </div>
            <footer className="-mx-2 flex min-h-[76px] items-center rounded-b-lg bg-[#1b1b1b] px-4 py-2.5">
              <div
                className="flex w-full flex-wrap items-center gap-2.5"
                role="group"
                aria-label="Controles da transmissão"
              >
                <button
                  type="button"
                  className={footerIconButtonClass}
                  onClick={() => {
                    setMuted((value) => !value);
                    if (remoteVideo.current) remoteVideo.current.muted = !muted;
                  }}
                  aria-label={muted ? "Ativar som" : "Mutar som"}
                  title={muted ? "Ativar som" : "Mutar som"}
                >
                  {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
                <label className="flex w-[92px] items-center max-[1100px]:w-[70px] max-[560px]:w-[58px]">
                  <span className="sr-only">Volume</span>
                  <input
                    className="w-full accent-[#f3f2f5]"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setVolume(next);
                      if (remoteVideo.current)
                        remoteVideo.current.volume = next;
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={footerIconButtonClass}
                  onClick={toggleFullscreen}
                  aria-label="Tela cheia"
                  title="Tela cheia"
                >
                  <Expand size={17} />
                </button>
                <label className="relative flex items-center gap-2 text-xs font-semibold text-[#dedce2] whitespace-nowrap">
                  <span>Áudio</span>
                  <select
                    className={footerSelectClass}
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
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 text-white"
                    size={16}
                    strokeWidth={2.5}
                  />
                </label>
                {!viewer && (
                  <button
                    type="button"
                    className={`${footerShareButtonClass} ml-auto ${sharing ? "border-[#d85d67] bg-[#52272c] text-[#ffb2b8] hover:bg-[#6a2d34] hover:text-white" : "bg-[#323234] text-white hover:bg-[#5a595c]"}`}
                    onClick={() => {
                      if (sharing) {
                        stopShare();
                        return;
                      }
                      setSourcePickerOpen(true);
                    }}
                    aria-label={
                      sharing ? "Encerrar transmissão" : "Compartilhar tela"
                    }
                    title={
                      sharing ? "Encerrar transmissão" : "Compartilhar tela"
                    }
                  >
                    <MonitorUp size={17} />
                    <span>
                      {sharing ? "Encerrar transmissão" : "Compartilhar tela"}
                    </span>
                  </button>
                )}
                <div
                  className={`flex items-center gap-1.5 text-xs font-semibold text-[#dedce2] ${viewer ? "ml-auto" : "ml-0"}`}
                  role="group"
                  aria-label="Qualidade da transmissão"
                >
                  <span>Qualidade</span>
                  {(["1080p", "720p", "480p"] as const).map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      className={`${footerQualityButtonClass} ${qualityPreset === preset ? "border-transparent bg-[#5a595c] text-white" : "border-transparent bg-[#323234] text-[#f3f2f5] hover:border-transparent hover:bg-[#5a595c] hover:text-white"}`}
                      onClick={() => void setVideoQuality(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </footer>
          </div>
        </section>
      </div>
      {channelSettingsOpen && !viewer && (
        <div
          className="channel-settings-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="channel-settings-title"
        >
          <form
            className="channel-settings-card"
            onSubmit={(event) => {
              event.preventDefault();
              void saveChannel();
            }}
          >
            <div className="channel-settings-header">
              <div>
                <p>Configuração permanente</p>
                <h2 id="channel-settings-title">Personalizar canal</h2>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setChannelSettingsOpen(false)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="channel-avatar-editor">
              <div className="channel-avatar-preview">
                {channelDraft.avatar ? (
                  <img
                    src={channelDraft.avatar}
                    alt="Prévia da foto do canal"
                  />
                ) : (
                  <Radio size={28} />
                )}
              </div>
              <div>
                <label className="channel-upload-button">
                  <ImagePlus size={16} />
                  Trocar foto
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={uploadChannelAvatar}
                  />
                </label>
                {channelDraft.avatar && (
                  <button
                    type="button"
                    className="channel-remove-avatar"
                    onClick={() =>
                      setChannelDraft((current) => ({
                        ...current,
                        avatar: null,
                      }))
                    }
                  >
                    Remover foto
                  </button>
                )}
                <small>PNG, JPEG ou WebP · até 700 KB</small>
              </div>
            </div>
            <label>
              Nome do canal
              <input
                value={channelDraft.name}
                maxLength={40}
                required
                onChange={(event) =>
                  setChannelDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Categoria
              <input
                value={channelDraft.category}
                maxLength={32}
                required
                onChange={(event) =>
                  setChannelDraft((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Descrição
              <textarea
                value={channelDraft.description}
                maxLength={100}
                rows={3}
                onChange={(event) =>
                  setChannelDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            {channelError && (
              <p className="channel-settings-error">{channelError}</p>
            )}
            <div className="channel-settings-actions">
              <button
                type="button"
                onClick={() => setChannelSettingsOpen(false)}
              >
                Cancelar
              </button>
              <button type="submit" disabled={channelSaving}>
                {channelSaving ? "Salvando…" : "Salvar canal"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function ChannelSidebar({
  channel,
  viewer,
  sharing,
  viewers,
  copied,
  onCopyInvite,
  onEdit,
}: {
  channel: ChannelProfile;
  viewer: boolean;
  sharing: boolean;
  viewers: { peerId: string; displayName: string }[];
  copied: boolean;
  onCopyInvite: () => void;
  onEdit: () => void;
}) {
  return (
    <aside
      className="persistent-channel-sidebar"
      aria-label="Canais da comunidade"
    >
      <div className="channel-community-header">
        <div className="channel-community-avatar size-17">
          {channel.avatar ? (
            <img src={channel.avatar} alt="" />
          ) : (
            <Radio size={18} />
          )}
        </div>
        <span>
          <strong>{channel.name}</strong>
          <small>Sala permanente</small>
        </span>
        <ChevronDown size={16} />
      </div>
      <nav className="channel-navigation">
        <p className="channel-category">Comunidade</p>
        <button type="button" className="channel-text-row">
          <Hash size={18} />
          <span>lobby</span>
        </button>
        <div className="channel-category-row">
          <p className="channel-category">{channel.category}</p>
          {!viewer && (
            <button type="button" onClick={onEdit} aria-label="Editar canal">
              <Settings2 size={14} />
            </button>
          )}
        </div>
        <div className="channel-live-block">
          <div className="channel-live-row">
            <Volume2 size={18} />
            <span>
              <strong>{channel.name}</strong>
              <small>{channel.description}</small>
            </span>
            <b className={sharing ? "is-live" : ""}>
              {sharing ? "AO VIVO" : "OFF"}
            </b>
          </div>
          {viewers.map((item) => (
            <div className="channel-member" key={item.peerId}>
              <span>{item.displayName.slice(0, 1).toUpperCase()}</span>
              <p>{item.displayName}</p>
              <Signal size={12} />
            </div>
          ))}
          {!viewers.length && (
            <p className="channel-empty-members">Aguardando espectadores</p>
          )}
        </div>
        <p className="channel-category channel-future-label">Próximas salas</p>
        <div className="channel-future-row">
          <VolumeX size={17} />
          <span>Mesa 02</span>
          <small>em breve</small>
        </div>
        <div className="channel-future-row">
          <VolumeX size={17} />
          <span>Mesa 03</span>
          <small>em breve</small>
        </div>
      </nav>
      <div className="channel-sidebar-footer">
        <button type="button" onClick={onCopyInvite}>
          <Copy size={16} />
          {copied ? "Link copiado" : "Copiar acesso permanente"}
        </button>
        {!viewer && (
          <button type="button" onClick={onEdit}>
            <Settings2 size={16} />
            Personalizar canal
          </button>
        )}
      </div>
    </aside>
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
