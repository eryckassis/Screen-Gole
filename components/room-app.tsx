"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppWindow,
  CheckCircle2,
  ImagePlus,
  Monitor,
  MonitorUp,
  PanelsTopLeft,
  Radio,
  Search,
  Signal,
  Volume2,
  X,
} from "lucide-react";
import {
  BroadcastStage,
  ChannelPanel,
  CommunityRail,
  ControlDock,
  DialogCloseButton,
  ParticipantStrip,
  RoomDialog,
  StreamSettingsDialog,
  ViewerJoinDialog,
  WorkspaceHeader,
} from "./room/room-ui";
import { FriendsDialog } from "./friends/friends-dialog";

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
type RoomMember = {
  userId: string;
  displayName: string;
  displayTag: string;
  avatarUrl: string | null;
  role: string;
};
type UserSuggestion = Omit<RoomMember, "role">;
type RoomInvite = {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};
const defaultChannel: ChannelProfile = {
  roomId,
  slug: "main",
  name: "Mesa Principal",
  category: "Transmissões",
  description: "Canal principal da comunidade",
  avatar: null,
};
const sourceTabButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const sourceCardButtonClass =
  "flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
type SessionPayload = {
  roomId: string;
  isLive: boolean;
  host: { peerId: string; role: string; displayName: string } | null;
  peers: { peerId: string; role: string; displayName: string }[];
};
type SignalsPayload = { signals: SignalRow[] };
type FriendsSummaryPayload = { incoming: unknown[] };

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
  accessToken?: string,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: accessToken ? "omit" : "same-origin",
  });
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

type QualityPreset = "2K" | "1080p" | "720p" | "480p";

const VIDEO_QUALITY_PRESETS: Record<
  QualityPreset,
  { width: number; height: number; frameRate: number }
> = {
  "2K": { width: 2560, height: 1440, frameRate: 60 },
  "1080p": { width: 1920, height: 1080, frameRate: 60 },
  "720p": { width: 1280, height: 720, frameRate: 60 },
  "480p": { width: 854, height: 480, frameRate: 60 },
};

const QUALITY_PRESETS = ["2K", "1080p", "720p", "480p"] as const;

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
  accessToken?: string;
  initialProfile?: { name: string; avatar: string };
  initialTag?: string;
};

export function RoomApp({
  apiBaseUrl = "",
  initialMode,
  inviteUrl,
  nativeCapture,
  setNativeFullscreen,
  accessToken,
  initialProfile,
  initialTag = "",
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
  const roomApi = useCallback(
    <T,>(path: string, init?: RequestInit) =>
      api<T>(normalizedApiBaseUrl, path, init, accessToken),
    [accessToken, normalizedApiBaseUrl],
  );
  const [joined, setJoined] = useState(true);
  const [viewerProfileOpen, setViewerProfileOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>(initialProfile || { name: "Usuário", avatar: "" });
  const [draft, setDraft] = useState<Profile>(profile);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState(0);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [displayTag, setDisplayTag] = useState(initialTag);
  const [channel, setChannel] = useState<ChannelProfile>(defaultChannel);
  const [channelDraft, setChannelDraft] =
    useState<ChannelProfile>(defaultChannel);
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [memberTag, setMemberTag] = useState("");
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
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
  const [quality, setQuality] = useState("2K · 2560×1440 solicitado");
  const [qualityPreset, setQualityPreset] =
    useState<QualityPreset>("2K");
  const [streamSettingsOpen, setStreamSettingsOpen] = useState(false);
  const [captureAudio, setCaptureAudio] = useState(true);
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
    const openFriendsSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "k") return;
      event.preventDefault();
      setFriendsOpen(true);
    };
    window.addEventListener("keydown", openFriendsSearch);
    return () => window.removeEventListener("keydown", openFriendsSearch);
  }, []);

  useEffect(() => {
    if (friendsOpen) return;

    let active = true;
    const refreshFriendRequests = async () => {
      try {
        const result = await roomApi<FriendsSummaryPayload>("/api/friends");
        if (active) setIncomingFriendRequests(result.incoming.length);
      } catch {
        // A sala continua utilizável caso a rede de amigos esteja indisponível.
      }
    };

    void refreshFriendRequests();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshFriendRequests();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [friendsOpen, roomApi]);

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
      await roomApi("/api/room/signals", {
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
    [roomApi],
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
      const session = await roomApi<SessionPayload>(
        "/api/room/session",
      );
      setViewers(session.peers || []);
      setRoomLive(session.isLive);
      if (viewer && !session.isLive && connections.current.size === 0)
        setStatus("Aguardando transmissão");
      if (
        viewer &&
        session.isLive &&
        session.host &&
        session.host.peerId !== peerId
      )
        await connectViewer(session.host.peerId);
      const data = await roomApi<SignalsPayload>(
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
    roomApi,
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
      const payload = await roomApi<ChannelPayload>(
        "/api/room/channel",
      );
      setChannel(payload.channel);
      setChannelDraft(payload.channel);
    } catch {
      // A configuração padrão mantém a sala utilizável durante uma retomada do banco.
    }
  }, [roomApi]);

  useEffect(() => {
    void loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const query = memberTag.trim();
    if (viewer || !channelSettingsOpen || query.length < 2) {
      setUserSuggestions([]);
      setUserSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setUserSearchLoading(true);
      try {
        const payload = await roomApi<{
          suggestions: UserSuggestion[];
        }>(`/api/rooms/${roomId}/members?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        setUserSuggestions(payload.suggestions || []);
      } catch (error) {
        if (!controller.signal.aborted)
          setAccessError(
            error instanceof Error
              ? error.message
              : "Não foi possível pesquisar usuários",
          );
      } finally {
        if (!controller.signal.aborted) setUserSearchLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [channelSettingsOpen, memberTag, roomApi, viewer]);

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
    void roomApi("/api/room/session", {
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
      roomApi("/api/room/heartbeat", {
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
  }, [joined, poll, profile.name, roomApi, sharing, viewer]);

  async function startShare(kind: "screen" | "window" | "tab" = sourceKind) {
    let displayStream: MediaStream | null = null;
    let nativeAudio: NativeAudioSession | null = null;
    try {
      const selectedSource = nativeSources.find(
        (source) => source.id === selectedSourceId,
      );
      const useNativeProcessAudio = Boolean(
        captureAudio &&
          nativeCapture &&
          kind === "window" &&
          selectedSource?.processId,
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
      const requestedQuality = VIDEO_QUALITY_PRESETS[qualityPreset];
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface,
          width: { ideal: requestedQuality.width, max: 3840 },
          height: { ideal: requestedQuality.height, max: 2160 },
          frameRate: {
            ideal: requestedQuality.frameRate,
            max: requestedQuality.frameRate,
          },
        } as MediaTrackConstraints,
        audio: captureAudio
          ? useNativeProcessAudio
            ? false
            : ({
                channelCount: 2,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              } as MediaTrackConstraints)
          : false,
      });
      const videoTrack = displayStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("Nenhuma fonte de vídeo selecionada");
      videoTrack.contentHint = "detail";

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
  async function setVideoQuality(preset: QualityPreset) {
    setQualityPreset(preset);
    const requestedQuality = VIDEO_QUALITY_PRESETS[preset];
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({
          width: { ideal: requestedQuality.width },
          height: { ideal: requestedQuality.height },
          frameRate: {
            ideal: requestedQuality.frameRate,
            max: requestedQuality.frameRate,
          },
        });
        track.contentHint = "detail";
        const settings = track.getSettings();
        setQuality(
          `${settings.width || requestedQuality.width}×${settings.height || requestedQuality.height} · ${settings.frameRate ? Math.round(settings.frameRate) : requestedQuality.frameRate} FPS efetivo`,
        );
        return;
      } catch {
        setStatus("Qualidade não suportada — usando fallback");
      }
    }
    setQuality(
      `${preset} · ${requestedQuality.width}×${requestedQuality.height} solicitado`,
    );
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
    try {
      let url = inviteUrl || `${window.location.origin}/s/${channel.slug}`;
      if (!viewer) {
        const payload = await roomApi<{ invite: { url: string } }>(`/api/rooms/${roomId}/invites`, { method: "POST" });
        url = payload.invite.url;
      }
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível criar o convite");
    }
  }
  async function loadRoomAccess() {
    if (viewer) return;
    setAccessLoading(true);
    setAccessError("");
    try {
      const [memberPayload, invitePayload] = await Promise.all([
        roomApi<{ members: RoomMember[] }>(`/api/rooms/${roomId}/members`),
        roomApi<{ invites: RoomInvite[] }>(`/api/rooms/${roomId}/invites`),
      ]);
      setMembers(memberPayload.members);
      setInvites(invitePayload.invites);
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Não foi possível carregar os acessos");
    } finally {
      setAccessLoading(false);
    }
  }
  async function addMember(selectedTag = memberTag.trim()) {
    if (!selectedTag) return;
    setAccessLoading(true);
    setAccessError("");
    try {
      await roomApi(`/api/rooms/${roomId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayTag: selectedTag }),
      });
      setMemberTag("");
      setUserSuggestions([]);
      await loadRoomAccess();
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Não foi possível adicionar o membro");
      setAccessLoading(false);
    }
  }
  async function removeMember(userId: string) {
    setAccessLoading(true);
    try {
      await roomApi(`/api/rooms/${roomId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      await loadRoomAccess();
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Não foi possível remover o membro");
      setAccessLoading(false);
    }
  }
  async function revokeInvite(inviteId: string) {
    setAccessLoading(true);
    try {
      await roomApi(`/api/rooms/${roomId}/invites`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });
      await loadRoomAccess();
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Não foi possível revogar o convite");
      setAccessLoading(false);
    }
  }
  function openChannelSettings() {
    setChannelDraft(channel);
    setChannelError("");
    setChannelSettingsOpen(true);
    void loadRoomAccess();
  }
  function toggleMuted() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (remoteVideo.current) remoteVideo.current.muted = nextMuted;
  }
  function changeVolume(nextVolume: number) {
    setVolume(nextVolume);
    if (remoteVideo.current) remoteVideo.current.volume = nextVolume;
  }
  function changeCaptureAudio(enabled: boolean) {
    setCaptureAudio(enabled);
    const audioTracks = streamRef.current?.getAudioTracks() ?? [];
    audioTracks.forEach((track) => {
      track.enabled = enabled;
    });
    if (audioTracks.length > 0) {
      setStatus(
        enabled
          ? "Áudio da transmissão ativado"
          : "Áudio da transmissão desativado",
      );
    } else if (enabled && sharing) {
      setStatus("O áudio será ativado ao escolher novamente a fonte");
    }
  }
  async function leaveRoom() {
    for (const connection of connections.current.values()) connection.close();
    connections.current.clear();
    pendingIce.current.clear();
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    await roomApi("/api/room/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peerId }),
    }).catch(() => undefined);
    setJoined(false);
    setRoomLive(false);
    setPlaybackBlocked(false);
    setStatus("Você saiu da sala");
  }
  async function saveChannel() {
    setChannelSaving(true);
    setChannelError("");
    try {
      const payload = await roomApi<ChannelPayload>(
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
    if (!file) return;
    if (file.size > 700_000) {
      setProfileError("Escolha uma imagem de até 700 KB");
      return;
    }
    setProfileError("");
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((p) => ({ ...p, avatar: String(reader.result) }));
    reader.readAsDataURL(file);
  }
  async function saveProfile() {
    setProfileSaving(true);
    setProfileError("");
    try {
      const payload = await roomApi<{ user: { displayName: string; displayTag: string; avatarUrl: string | null } }>("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: draft.name, avatarUrl: draft.avatar }),
      });
      setProfile({ name: payload.user.displayName, avatar: payload.user.avatarUrl || profile.avatar });
      setDraft({ name: payload.user.displayName, avatar: payload.user.avatarUrl || profile.avatar });
      setDisplayTag(payload.user.displayTag);
      setProfileSettingsOpen(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Não foi possível salvar o perfil");
    } finally {
      setProfileSaving(false);
    }
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

  return (
    <main className="room-app-frame">
      {!viewer && sourcePickerOpen && !sharing && (
        <RoomDialog
          open={sourcePickerOpen && !sharing}
          onOpenChange={(open) => setSourcePickerOpen(open)}
          className="source-picker-dialog"
          label="Escolher o que transmitir"
        >
          <section
            className="w-full overflow-hidden"
            aria-labelledby="source-picker-title"
            aria-describedby="source-picker-description"
          >
            <header className="flex items-start justify-between gap-6 border-b border-white/8 px-5 py-6 sm:px-8 sm:py-7">
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
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
                  className="mt-2 max-w-[540px] text-sm leading-6 text-muted-foreground sm:text-[15px]"
                >
                  {nativeCapture
                    ? `Fontes reais detectadas no ${nativeCapture.platformLabel}.`
                    : "Selecione uma fonte e ative o áudio no próximo passo."}
                </p>
              </div>
              <button
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-white/20 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSourcePickerOpen(false)}
                aria-label="Fechar seletor de fonte"
              >
                <X size={20} />
              </button>
            </header>

            <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-7">
              <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-background px-4 text-muted-foreground transition-colors focus-within:border-white/35 focus-within:ring-2 focus-within:ring-white/10">
                <Search className="shrink-0" size={18} />
                <input
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
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
                    className={`${sourceTabButtonClass} ${sourceKind === kind ? "bg-[var(--sg-surface-active)] text-foreground" : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}
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
                  <p className="rounded-xl border border-dashed border-border bg-background p-5 text-center text-sm text-muted-foreground">
                    Lendo fontes do Windows…
                  </p>
                )}
                {sourceError && (
                  <p
                    className="rounded-xl border border-destructive/50 bg-[var(--sg-danger-soft)] p-4 text-sm leading-6 text-foreground"
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
                      className={`${sourceCardButtonClass} ${selectedSourceId === source.id ? "border-white/35 bg-muted" : "border-border bg-background hover:border-white/20 hover:bg-muted/40"}`}
                      onClick={() => setSelectedSourceId(source.id)}
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground">
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
                        <small className="truncate text-xs leading-5 text-muted-foreground">
                          {source.processName ? `${source.processName} · ` : ""}
                          {source.width}×{source.height}
                          {source.audioCapable ? " · áudio isolado" : ""}
                        </small>
                      </span>
                      {selectedSourceId === source.id && (
                        <CheckCircle2
                          className="shrink-0 text-[var(--sg-success)]"
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
                    <p className="rounded-xl border border-dashed border-border bg-background p-5 text-center text-sm text-muted-foreground">
                      Nenhuma fonte correspondente foi encontrada.
                    </p>
                  )}
                {(!nativeCapture || sourceKind === "tab") && (
                  <button
                    type="button"
                    className={`${sourceCardButtonClass} border-border bg-background`}
                    onClick={() => setSelectedSourceId(null)}
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-transparent bg-background text-foreground">
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
                      <small className="truncate text-xs leading-5 text-muted-foreground">
                        {sourceKind === "tab" && nativeCapture
                          ? "A aba será escolhida no seletor seguro do WebView2"
                          : "Captura de vídeo em alta qualidade"}
                      </small>
                    </span>
                    <CheckCircle2
                      className="shrink-0 text-[var(--sg-success)]"
                      size={20}
                    />
                  </button>
                )}
              </div>

              <aside className="flex gap-3 rounded-xl border border-border bg-background p-4 sm:p-5">
                <Volume2 className="mt-0.5 shrink-0 text-white" size={20} />
                <div className="min-w-0">
                  <strong className="block text-sm font-bold text-white">
                    {sourceKind === "window" && nativeCapture
                      ? "Áudio isolado por aplicativo"
                      : "Áudio obrigatório"}
                  </strong>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {sourceKind === "window" && nativeCapture
                      ? "O Windows 11 captura somente o processo escolhido e não recaptura o Screen Gole."
                      : "No seletor do Windows, habilite o compartilhamento de áudio; sem uma faixa audível a transmissão não começa."}
                  </p>
                </div>
              </aside>

              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-foreground px-5 text-sm font-semibold text-background transition-colors hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40"
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
        </RoomDialog>
      )}
      <div className="room-desktop-shell">
        <CommunityRail
          channel={channel}
          viewer={viewer}
          profile={profile}
          onEdit={openChannelSettings}
        />
        <ChannelPanel
          channel={channel}
          viewer={viewer}
          sharing={viewer ? roomLive : sharing}
          viewers={viewers}
          copied={copied}
          onCopyInvite={() => void copyInvite()}
          onEdit={openChannelSettings}
        />
        <section className="room-workspace">
          <WorkspaceHeader
            channel={channel}
            status={status}
            viewer={viewer}
            copied={copied}
            profile={profile}
            onCopyInvite={() => void copyInvite()}
            onEdit={openChannelSettings}
            onProfile={() => {
              setDraft(profile);
              setProfileError("");
              setProfileSettingsOpen(true);
            }}
            onFriends={() => setFriendsOpen(true)}
            incomingFriendRequests={incomingFriendRequests}
          />
      <div className="workspace-content">
        <section className="workspace-stage-section">
          <div className="stage-card">
            <BroadcastStage
              viewer={viewer}
              joined={joined}
              sharing={sharing}
              status={status}
              quality={quality}
              muted={muted}
              playbackBlocked={viewer && playbackBlocked}
              mediaFullscreen={mediaFullscreen}
              videoRef={viewer ? remoteVideo : localVideo}
              stageRef={screenPreview}
              onJoin={() => setViewerProfileOpen(true)}
              onStartShare={() => setSourcePickerOpen(true)}
              onEnablePlayback={() => void enablePlayback()}
              onToggleFullscreen={() => void toggleFullscreen()}
              onLoadedMetadata={updatePlayback}
            />
          </div>
        </section>
        <ParticipantStrip
          viewer={viewer}
          sharing={viewer ? roomLive : sharing}
          profile={profile}
          viewers={viewers}
          onInvite={() => void copyInvite()}
        />
        {(joined || !viewer) ? (
          <ControlDock
            viewer={viewer}
            sharing={sharing}
            muted={muted}
            onToggleMuted={toggleMuted}
            onToggleFullscreen={() => void toggleFullscreen()}
            onToggleShare={() => {
              if (sharing) stopShare();
              else setSourcePickerOpen(true);
            }}
            onLeave={() => void leaveRoom()}
            onOpenSettings={() => setStreamSettingsOpen(true)}
          />
        ) : null}
      </div>
        </section>
      </div>
      <ViewerJoinDialog
        open={viewerProfileOpen}
        channel={channel}
        profile={draft}
        onOpenChange={setViewerProfileOpen}
        onProfileChange={setDraft}
        onAvatarChange={uploadAvatar}
        onSubmit={() => {
          setProfile(draft);
          setJoined(true);
          setViewerProfileOpen(false);
          setStatus("Entrando na sala");
        }}
      />
      <StreamSettingsDialog
        open={streamSettingsOpen}
        viewer={viewer}
        sharing={sharing}
        muted={muted}
        volume={volume}
        audioOutputs={audioOutputs}
        audioOutput={audioOutput}
        qualityPreset={qualityPreset}
        qualityPresets={QUALITY_PRESETS}
        captureAudio={captureAudio}
        onOpenChange={setStreamSettingsOpen}
        onToggleMuted={toggleMuted}
        onVolumeChange={changeVolume}
        onAudioOutputChange={(deviceId) => void changeAudioOutput(deviceId)}
        onQualityChange={(preset) =>
          void setVideoQuality(preset as QualityPreset)
        }
        onCaptureAudioChange={changeCaptureAudio}
      />
      <FriendsDialog
        open={friendsOpen}
        onOpenChange={setFriendsOpen}
        request={roomApi}
        onIncomingCountChange={setIncomingFriendRequests}
        onJoinRoom={(room) => {
          setFriendsOpen(false);
          if (room.roomId !== roomId && !accessToken)
            window.location.assign(`/s/${room.slug}`);
        }}
      />
      {profileSettingsOpen && (
        <RoomDialog open={profileSettingsOpen} onOpenChange={setProfileSettingsOpen} className="channel-settings-dialog" label="Editar perfil">
          <form className="channel-settings-card" onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
            <div className="channel-settings-header"><div><p>Conta Google</p><h2>Editar perfil</h2></div><DialogCloseButton /></div>
            <div className="flex items-center gap-4 rounded-xl bg-[#0b0b0b] p-4">
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-lg font-bold text-white">{draft.avatar ? <img src={draft.avatar} alt="Prévia da foto do perfil" className="size-full object-cover" /> : profile.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{displayTag || profile.name}</strong><small className="text-xs text-white/45">O número da tag permanece o mesmo.</small></div>
              <label className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10">Trocar foto<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadAvatar} /></label>
            </div>
            <label>Nome público<input value={draft.name} minLength={2} maxLength={24} required onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            {profileError && <p className="channel-settings-error">{profileError}</p>}
            <div className="channel-settings-actions">
              {!accessToken && <a href="/logout" className="mr-auto self-center text-xs font-bold text-red-300">Sair da conta</a>}
              <button type="button" onClick={() => setProfileSettingsOpen(false)}>Cancelar</button>
              <button type="submit" disabled={profileSaving}>{profileSaving ? "Salvando…" : "Salvar perfil"}</button>
            </div>
          </form>
        </RoomDialog>
      )}
      {channelSettingsOpen && !viewer && (
        <RoomDialog
          open={channelSettingsOpen}
          onOpenChange={setChannelSettingsOpen}
          className="channel-settings-dialog"
          label="Personalizar canal"
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
              <DialogCloseButton />
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
            <section className="mt-3 space-y-5 border-t border-white/10 pt-6" aria-labelledby="room-access-title">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Acesso permanente</p>
                <h3 id="room-access-title" className="mt-2 text-lg font-bold text-white">Membros e convites</h3>
                <p className="mt-1 text-xs leading-5 text-white/50">Adicione uma tag ou gere um link válido por sete dias.</p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-3.5 text-white/35" size={17} aria-hidden="true" />
                <input
                  value={memberTag}
                  onChange={(event) => {
                    setMemberTag(event.target.value);
                    setAccessError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const firstMatch = userSuggestions[0]?.displayTag;
                    void addMember(firstMatch || memberTag.trim());
                  }}
                  placeholder="Pesquisar por nome ou Nome#1234"
                  aria-label="Pesquisar usuário para adicionar"
                  aria-autocomplete="list"
                  className="min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0b] pl-11 pr-24 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30"
                />
                <span className="pointer-events-none absolute right-4 top-3.5 text-[10px] font-bold uppercase tracking-wider text-white/30">
                  {userSearchLoading ? "Buscando…" : "Usuários"}
                </span>
                {memberTag.trim().length >= 2 && !userSearchLoading && (
                  <div className="absolute inset-x-0 top-[calc(100%+.5rem)] z-20 overflow-hidden rounded-xl border border-white/10 bg-[#121212] p-1 shadow-2xl shadow-black/50" role="listbox">
                    {userSuggestions.length ? userSuggestions.map((user) => (
                      <button
                        key={user.userId}
                        type="button"
                        role="option"
                        aria-selected="false"
                        disabled={accessLoading}
                        onClick={() => void addMember(user.displayTag)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                      >
                        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-xs font-bold text-white">
                          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full object-cover" /> : user.displayName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm text-white">{user.displayName}</strong>
                          <small className="block truncate text-xs text-white/45">{user.displayTag}</small>
                        </span>
                        <span className="text-xs font-bold text-white/70">Adicionar</span>
                      </button>
                    )) : (
                      <p className="px-3 py-4 text-center text-xs text-white/45">Nenhum usuário disponível com esse nome.</p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {members.map((member) => (
                  <div key={member.userId} className="flex items-center gap-3 rounded-xl bg-[#0b0b0b] p-3">
                    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-xs font-bold text-white">{member.avatarUrl ? <img src={member.avatarUrl} alt="" className="size-full object-cover" /> : member.displayName.slice(0, 1).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{member.displayTag}</strong><small className="text-[10px] font-bold uppercase tracking-wider text-white/35">{member.role === "owner" ? "Proprietário" : "Membro"}</small></span>
                    {member.role !== "owner" && <button type="button" disabled={accessLoading} onClick={() => void removeMember(member.userId)} className="rounded-lg px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10">Remover</button>}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4">
                <div><strong className="block text-sm text-white">Links de convite</strong><small className="text-xs text-white/40">{invites.filter((invite) => !invite.revokedAt && new Date(invite.expiresAt) > new Date()).length} ativo(s)</small></div>
                <button type="button" disabled={accessLoading} onClick={() => void copyInvite().then(loadRoomAccess)} className="min-h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-white hover:bg-white/10">Criar e copiar</button>
              </div>
              {invites.filter((invite) => !invite.revokedAt && new Date(invite.expiresAt) > new Date()).map((invite) => (
                <div key={invite.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#0b0b0b] px-4 py-3 text-xs text-white/55"><span>Expira em {new Date(invite.expiresAt).toLocaleDateString("pt-BR")}</span><button type="button" disabled={accessLoading} onClick={() => void revokeInvite(invite.id)} className="font-bold text-red-300">Revogar</button></div>
              ))}
              {accessLoading && <p className="text-xs text-white/40">Atualizando acessos…</p>}
              {accessError && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-xs leading-5 text-red-200" role="alert">{accessError}</p>}
            </section>
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
        </RoomDialog>
      )}
    </main>
  );
}
