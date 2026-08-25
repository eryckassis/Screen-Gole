"use client";

import type { ChangeEvent, ReactNode, RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ThinkingOrb } from "thinking-orbs";
import {
  Bell,
  ChevronDown,
  Copy,
  Expand,
  Hash,
  LogOut,
  MonitorUp,
  Radio,
  Search,
  Settings2,
  Signal,
  SlidersHorizontal,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from "lucide-react";

export type RoomChannel = {
  name: string;
  category: string;
  description: string;
  avatar: string | null;
};

export type RoomViewer = {
  peerId: string;
  displayName: string;
};

type ProfileDraft = {
  name: string;
  avatar: string;
};

function Initials({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return <span aria-hidden="true">{letters || "SG"}</span>;
}

function Avatar({
  name,
  src,
  className = "",
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <span className={`room-avatar ${className}`}>
      {src ? (
        <img src={src} alt="" width={48} height={48} />
      ) : (
        <Initials name={name} />
      )}
    </span>
  );
}

export function RoomDialog({
  open,
  onOpenChange,
  children,
  className = "",
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="room-dialog-backdrop" />
        <Dialog.Viewport className="room-dialog-viewport">
          <Dialog.Popup
            className={`room-dialog-popup ${className}`}
            aria-label={label}
          >
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DialogCloseButton({ label = "Fechar" }: { label?: string }) {
  return (
    <Dialog.Close className="room-icon-button" aria-label={label} title={label}>
      <X size={19} />
    </Dialog.Close>
  );
}

export function CommunityRail({
  channel,
  viewer,
  profile,
  onEdit,
}: {
  channel: RoomChannel;
  viewer: boolean;
  profile: ProfileDraft;
  onEdit: () => void;
}) {
  return (
    <aside className="community-rail" aria-label="Comunidades">
      <div className="community-brand" title="Screen Gole">
        <img src="/icon.svg" alt="Screen Gole" width={40} height={40} />
      </div>
      <span className="community-divider" />
      <button
        type="button"
        className="community-button is-active"
        aria-current="page"
        aria-label={`${channel.name}, comunidade atual`}
      >
        {channel.avatar ? (
          <img src={channel.avatar} alt="" width={42} height={42} />
        ) : (
          <Radio size={20} />
        )}
      </button>
      <div className="community-rail-spacer" />
      {!viewer ? (
        <button
          type="button"
          className="community-button"
          onClick={onEdit}
          aria-label="Configurações da comunidade"
          title="Configurações da comunidade"
        >
          <Settings2 size={20} />
        </button>
      ) : null}
      <div
        className="community-profile"
        title={profile.name || (viewer ? "Espectador" : "Host")}
      >
        <Avatar
          name={profile.name || (viewer ? "Espectador" : "Host")}
          src={profile.avatar}
        />
        <span className="presence-dot" />
      </div>
    </aside>
  );
}

export function ChannelPanel({
  channel,
  viewer,
  sharing,
  viewers,
  copied,
  onCopyInvite,
  onEdit,
}: {
  channel: RoomChannel;
  viewer: boolean;
  sharing: boolean;
  viewers: RoomViewer[];
  copied: boolean;
  onCopyInvite: () => void;
  onEdit: () => void;
}) {
  return (
    <aside className="channel-panel" aria-label="Navegação da comunidade">
      <header className="channel-panel-header">
        <div>
          <span>Comunidade</span>
          <strong>{channel.name}</strong>
        </div>
        <ChevronDown size={17} aria-hidden="true" />
      </header>

      <nav className="channel-panel-scroll">
        <section className="channel-group" aria-labelledby="general-heading">
          <div className="channel-group-heading">
            <h2 id="general-heading">Geral</h2>
          </div>
          <div className="channel-static-row">
            <Hash size={16} />
            <span>lobby</span>
          </div>
          <div className="channel-static-row">
            <Hash size={16} />
            <span>informações</span>
          </div>
        </section>

        <section
          className="channel-group channel-room-group"
          aria-labelledby="rooms-heading"
        >
          <div className="channel-group-heading">
            <h2 id="rooms-heading">Sala ao vivo</h2>
            <span className={`room-state-badge ${sharing ? "is-live" : ""}`}>
              {sharing ? "AO VIVO" : "OFF"}
            </span>
          </div>
          <div className="channel-current-room" aria-current="page">
            <Volume2 size={17} />
            <span>
              <strong>{channel.name}</strong>
              <small>{channel.description}</small>
            </span>
          </div>
          <div className="channel-members" aria-label="Pessoas na sala">
            {viewers.map((item) => (
              <div className="channel-member-row" key={item.peerId}>
                <Avatar name={item.displayName} />
                <span>{item.displayName}</span>
                <Signal size={12} aria-label="Conectado" />
              </div>
            ))}
            {!viewers.length ? (
              <p className="channel-empty">Aguardando espectadores</p>
            ) : null}
          </div>
        </section>

        <section className="channel-group" aria-labelledby="other-heading">
          <div className="channel-group-heading">
            <h2 id="other-heading">Outros</h2>
          </div>
          <button
            type="button"
            className="channel-action-row"
            onClick={onCopyInvite}
          >
            <Copy size={16} />
            <span>{copied ? "Link copiado" : "Copiar convite"}</span>
          </button>
          {!viewer ? (
            <button
              type="button"
              className="channel-action-row"
              onClick={onEdit}
            >
              <Settings2 size={16} />
              <span>Personalizar sala</span>
            </button>
          ) : null}
        </section>
      </nav>

      <footer className="channel-panel-footer">
        <span className="panel-live-dot" />
        <div>
          <strong>{viewer ? "Modo espectador" : "Modo host"}</strong>
          <small>{sharing ? "Transmissão ativa" : "Sala conectada"}</small>
        </div>
      </footer>
    </aside>
  );
}

export function WorkspaceHeader({
  channel,
  status,
  viewer,
  copied,
  profile,
  onCopyInvite,
  onEdit,
  onProfile,
  onFriends,
  incomingFriendRequests,
}: {
  channel: RoomChannel;
  status: string;
  viewer: boolean;
  copied: boolean;
  profile: ProfileDraft;
  onCopyInvite: () => void;
  onEdit: () => void;
  onProfile: () => void;
  onFriends: () => void;
  incomingFriendRequests: number;
}) {
  const hasFriendRequests = incomingFriendRequests > 0;

  return (
    <header className="workspace-header">
      <div className="workspace-heading">
        <span>Odyssey Studio</span>
        <h1>{channel.name}</h1>
      </div>
      <div className="workspace-actions">
        <button
          type="button"
          onClick={onFriends}
          className={`relative flex size-10 shrink-0 items-center justify-center gap-2 rounded-2xl border text-left text-sm transition md:w-[clamp(190px,20vw,280px)] md:justify-start md:px-3.5 ${
            hasFriendRequests
              ? "border-violet-400/50 bg-violet-500/15 text-white hover:bg-violet-500/20"
              : "border-white/10 bg-[#1b1b1b] text-white/55 hover:border-white/20 hover:bg-[#242424] hover:text-white"
          }`}
          aria-label={hasFriendRequests ? `${incomingFriendRequests} pedido(s) de amizade recebido(s)` : "Pesquisar amigos e usuários"}
          title={hasFriendRequests ? "Abrir pedidos de amizade" : "Pesquisar amigos (Ctrl+K)"}
        >
          {hasFriendRequests ? <UserPlus size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
          <span className="hidden min-w-0 flex-1 truncate md:block">
            {hasFriendRequests
              ? `${incomingFriendRequests} pedido${incomingFriendRequests === 1 ? "" : "s"} de amizade`
              : "Pesquisar pessoas"}
          </span>
          {hasFriendRequests ? (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-violet-500 px-1.5 py-0.5 text-[10px] font-black leading-4 text-white md:static">
              {incomingFriendRequests}
            </span>
          ) : (
            <kbd className="hidden rounded-md bg-black/35 px-1.5 py-1 font-mono text-[9px] text-white/35 lg:block">Ctrl K</kbd>
          )}
        </button>
        <div className="connection-pill" role="status" aria-live="polite">
          <Wifi size={16} />
          <span>{status}</span>
        </div>
        <button
          type="button"
          className="room-icon-button"
          onClick={onCopyInvite}
          aria-label={copied ? "Link copiado" : "Copiar convite"}
          title={copied ? "Link copiado" : "Copiar convite"}
        >
          <Copy size={18} />
        </button>
        {!viewer ? (
          <button
            type="button"
            className="room-icon-button"
            onClick={onEdit}
            aria-label="Configurações da sala"
            title="Configurações da sala"
          >
            <Settings2 size={18} />
          </button>
        ) : (
          <span className="room-icon-button is-static" title="Notificações">
            <Bell size={18} />
          </span>
        )}
        <button type="button" className="rounded-full" onClick={onProfile} aria-label="Editar perfil" title="Editar perfil">
          <Avatar
            className="workspace-avatar"
            name={profile.name || (viewer ? "Espectador" : "Host")}
            src={profile.avatar}
          />
        </button>
      </div>
    </header>
  );
}

export function BroadcastStage({
  viewer,
  joined,
  sharing,
  status,
  quality,
  muted,
  playbackBlocked,
  mediaFullscreen,
  videoRef,
  stageRef,
  onJoin,
  onStartShare,
  onEnablePlayback,
  onToggleFullscreen,
  onLoadedMetadata,
}: {
  viewer: boolean;
  joined: boolean;
  sharing: boolean;
  status: string;
  quality: string;
  muted: boolean;
  playbackBlocked: boolean;
  mediaFullscreen: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  onJoin: () => void;
  onStartShare: () => void;
  onEnablePlayback: () => void;
  onToggleFullscreen: () => void;
  onLoadedMetadata: (video: HTMLVideoElement) => void;
}) {
  const waitingForHost = viewer && joined && status !== "Ao vivo";

  return (
    <section
      ref={stageRef}
      className={`broadcast-stage ${mediaFullscreen ? "is-fullscreen" : ""}`}
      aria-label="Palco da transmissão"
    >
      <video
        ref={videoRef}
        autoPlay
        muted={viewer ? muted : true}
        playsInline
        className="broadcast-video"
        aria-label={
          viewer ? "Transmissão da tela do host" : "Prévia da sua tela"
        }
        onLoadedMetadata={(event) => onLoadedMetadata(event.currentTarget)}
      />

      {!viewer && !sharing ? (
        <div className="stage-state">
          <ThinkingOrb
            className="stage-thinking-orb"
            state="composing"
            size={64}
            aria-label="Palco pronto para compartilhar"
          />
          <p>Seu palco está pronto</p>
          <h2>Compartilhe uma tela, janela ou aplicativo</h2>
          <button
            type="button"
            className="stage-primary-action"
            onClick={onStartShare}
          >
            Escolher fonte
          </button>
        </div>
      ) : null}

      {viewer && !joined ? (
        <div className="stage-state">
          <span className="stage-state-icon">
            <Radio size={30} />
          </span>
          <p>Sala permanente</p>
          <h2>Entre para acompanhar a transmissão</h2>
          <button
            type="button"
            className="stage-primary-action"
            onClick={onJoin}
          >
            Entrar
          </button>
        </div>
      ) : null}

      {waitingForHost ? (
        <div className="stage-state">
          <span className="stage-state-icon">
            <Signal size={30} />
          </span>
          <p>Conectado à sala</p>
          <h2>{status}</h2>
        </div>
      ) : null}

      {playbackBlocked ? (
        <div className="playback-consent">
          <Volume2 size={22} />
          <strong>Ativar o áudio da transmissão</strong>
          <small>
            O Windows/WebView2 precisa de um clique para liberar o som.
          </small>
          <button type="button" onClick={onEnablePlayback}>
            Ativar áudio
          </button>
        </div>
      ) : null}

      {joined || !viewer ? (
        <div className="quality-chip">
          <Signal size={14} />
          <span>{quality}</span>
        </div>
      ) : null}

      {mediaFullscreen ? (
        <button
          type="button"
          className="fullscreen-exit"
          onClick={onToggleFullscreen}
          aria-label="Sair da tela cheia"
          title="Sair da tela cheia (Esc)"
        >
          <X size={19} />
          <span>Sair da tela cheia</span>
        </button>
      ) : null}
    </section>
  );
}

export function ParticipantStrip({
  viewer,
  sharing,
  profile,
  viewers,
  onInvite,
}: {
  viewer: boolean;
  sharing: boolean;
  profile: ProfileDraft;
  viewers: RoomViewer[];
  onInvite: () => void;
}) {
  const visibleViewers = viewers.slice(0, 2);
  const hiddenCount = Math.max(0, viewers.length - visibleViewers.length);

  return (
    <section className="participant-strip" aria-label="Pessoas na transmissão">
      <article className={`participant-card ${sharing ? "is-live" : ""}`}>
        <div className="participant-card-visual">
          <Avatar
            className="participant-avatar"
            name={viewer ? "Host da sala" : profile.name || "Você"}
            src={viewer ? null : profile.avatar}
          />
        </div>
        <footer>
          <div>
            <strong>{viewer ? "Host da sala" : profile.name || "Você"}</strong>
            <small>{sharing ? "Transmitindo agora" : "Host"}</small>
          </div>
          <span className="participant-audio">
            <Signal size={14} />
          </span>
        </footer>
      </article>

      {visibleViewers.map((item) => (
        <article className="participant-card" key={item.peerId}>
          <div className="participant-card-visual">
            <Avatar className="participant-avatar" name={item.displayName} />
          </div>
          <footer>
            <div>
              <strong>{item.displayName}</strong>
              <small>Assistindo</small>
            </div>
            <span className="participant-audio">
              <Volume2 size={14} />
            </span>
          </footer>
        </article>
      ))}

      {visibleViewers.length === 0 ? (
        <article className="participant-card waiting-card">
          <span className="invite-card-icon">
            <Users size={24} />
          </span>
          <strong>Aguardando pessoas</strong>
          <small>Novos espectadores aparecerão aqui</small>
        </article>
      ) : null}

      {visibleViewers.length < 2 ? (
        <button
          type="button"
          className="participant-card invite-card"
          onClick={onInvite}
        >
          <span className="invite-card-icon">
            <UserPlus size={24} />
          </span>
          <strong>Convidar pessoas</strong>
          <small>Copiar acesso permanente</small>
        </button>
      ) : null}

      {hiddenCount > 0 ? (
        <div
          className="participant-overflow"
          aria-label={`${hiddenCount} participantes adicionais`}
        >
          +{hiddenCount}
        </div>
      ) : null}
    </section>
  );
}

export function ControlDock({
  viewer,
  sharing,
  muted,
  onToggleMuted,
  onToggleFullscreen,
  onToggleShare,
  onLeave,
  onOpenSettings,
}: {
  viewer: boolean;
  sharing: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  onToggleFullscreen: () => void;
  onToggleShare: () => void;
  onLeave: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <footer className="control-bar" aria-label="Controles da sala">
      <div className="control-context">
        <SlidersHorizontal size={17} />
        <span>{viewer ? "Controles de reprodução" : "Controles do host"}</span>
      </div>

      <div className="control-dock" role="group" aria-label="Ações principais">
        {viewer ? (
          <button
            type="button"
            className="dock-button"
            onClick={onToggleMuted}
            aria-label={muted ? "Ativar som" : "Mutar som"}
            title={muted ? "Ativar som" : "Mutar som"}
          >
            {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
        ) : null}
        <button
          type="button"
          className="dock-button"
          onClick={onToggleFullscreen}
          aria-label="Tela cheia"
          title="Tela cheia"
        >
          <Expand size={19} />
        </button>
        <button
          type="button"
          className={`dock-button dock-primary ${sharing || viewer ? "is-danger" : ""}`}
          onClick={viewer ? onLeave : onToggleShare}
          aria-label={
            viewer
              ? "Sair da sala"
              : sharing
                ? "Encerrar transmissão"
                : "Compartilhar tela"
          }
          title={
            viewer
              ? "Sair da sala"
              : sharing
                ? "Encerrar transmissão"
                : "Compartilhar tela"
          }
        >
          {viewer ? <LogOut size={20} /> : <MonitorUp size={20} />}
        </button>
      </div>

      <div className="control-settings">
        <button
          type="button"
          className="control-settings-trigger"
          onClick={onOpenSettings}
          aria-label="Abrir configurações de imagem e som"
        >
          <Settings2 size={18} />
          <span>
            <small>Configurações</small>
            <strong>Imagem e som</strong>
          </span>
        </button>
      </div>
    </footer>
  );
}

const qualityDetails: Record<string, string> = {
  "2K": "2560×1440 · 60 FPS",
  "1080p": "1920×1080 · 60 FPS",
  "720p": "1280×720 · 60 FPS",
  "480p": "854×480 · 60 FPS",
};

export function StreamSettingsDialog({
  open,
  viewer,
  sharing,
  muted,
  volume,
  audioOutputs,
  audioOutput,
  qualityPreset,
  qualityPresets,
  captureAudio,
  onOpenChange,
  onToggleMuted,
  onVolumeChange,
  onAudioOutputChange,
  onQualityChange,
  onCaptureAudioChange,
}: {
  open: boolean;
  viewer: boolean;
  sharing: boolean;
  muted: boolean;
  volume: number;
  audioOutputs: MediaDeviceInfo[];
  audioOutput: string;
  qualityPreset: string;
  qualityPresets: readonly string[];
  captureAudio: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleMuted: () => void;
  onVolumeChange: (value: number) => void;
  onAudioOutputChange: (deviceId: string) => void;
  onQualityChange: (preset: string) => void;
  onCaptureAudioChange: (enabled: boolean) => void;
}) {
  const volumePercent = Math.round(volume * 100);

  return (
    <RoomDialog
      open={open}
      onOpenChange={onOpenChange}
      className="stream-settings-dialog"
      label="Configurações de imagem e som"
    >
      <header className="dialog-heading stream-settings-heading">
        <div>
          <span>{viewer ? "Reprodução" : "Transmissão"}</span>
          <Dialog.Title>Imagem e som</Dialog.Title>
          <Dialog.Description>
            {viewer
              ? "Ajuste como a transmissão é reproduzida neste dispositivo."
              : "Defina a qualidade antes ou durante o compartilhamento."}
          </Dialog.Description>
        </div>
        <DialogCloseButton />
      </header>

      <div className="stream-settings-content">
        {!viewer ? (
          <fieldset className="stream-settings-section">
            <legend>
              <MonitorUp size={15} aria-hidden="true" />
              Qualidade de imagem
            </legend>
            <p className="settings-helper">
              {sharing
                ? "A nova resolução será aplicada à transmissão atual."
                : "A resolução será solicitada ao iniciar a captura."}
            </p>
            <div className="quality-option-list">
              {qualityPresets.map((preset) => (
                <label
                  className={`quality-option ${qualityPreset === preset ? "is-selected" : ""}`}
                  key={preset}
                >
                  <span>
                    <strong>{preset}</strong>
                    <small>{qualityDetails[preset]}</small>
                  </span>
                  <input
                    type="radio"
                    name="stream-quality"
                    value={preset}
                    checked={qualityPreset === preset}
                    onChange={() => onQualityChange(preset)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="stream-settings-section">
          <legend>
            <Volume2 size={15} aria-hidden="true" />
            {viewer ? "Som da reprodução" : "Som da transmissão"}
          </legend>

          {viewer ? (
            <>
              <label className="settings-toggle-row">
                <span>
                  <strong>Reproduzir áudio</strong>
                  <small>{muted ? "Som desativado" : "Som ativado"}</small>
                </span>
                <input
                  type="checkbox"
                  checked={!muted}
                  onChange={() => onToggleMuted()}
                />
              </label>

              <label className="settings-range-row">
                <span>
                  <strong>Volume</strong>
                  <output>{volumePercent}%</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  disabled={muted}
                  onChange={(event) => onVolumeChange(Number(event.target.value))}
                />
              </label>

              <label className="settings-select-row">
                <span>Saída de áudio</span>
                <span className="settings-select-control">
                  <select
                    value={audioOutput}
                    onChange={(event) => onAudioOutputChange(event.target.value)}
                  >
                    <option value="default">Dispositivo padrão</option>
                    {audioOutputs
                      .filter((device) => device.deviceId !== "default")
                      .map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Dispositivo ${device.deviceId.slice(0, 4)}`}
                        </option>
                      ))}
                  </select>
                  <ChevronDown size={15} aria-hidden="true" />
                </span>
              </label>
            </>
          ) : (
            <label className="settings-toggle-row">
              <span>
                <strong>Capturar áudio do desktop</strong>
                <small>
                  {sharing && captureAudio
                    ? "O áudio da fonte está incluído."
                    : sharing
                      ? "Será reativado na próxima captura."
                      : "Inclui o som da tela, janela ou aplicativo."}
                </small>
              </span>
              <input
                type="checkbox"
                checked={captureAudio}
                onChange={(event) => onCaptureAudioChange(event.target.checked)}
              />
            </label>
          )}
        </fieldset>
      </div>
    </RoomDialog>
  );
}

export function ViewerJoinDialog({
  open,
  channel,
  profile,
  onOpenChange,
  onProfileChange,
  onAvatarChange,
  onSubmit,
}: {
  open: boolean;
  channel: RoomChannel;
  profile: ProfileDraft;
  onOpenChange: (open: boolean) => void;
  onProfileChange: (profile: ProfileDraft) => void;
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
}) {
  return (
    <RoomDialog
      open={open}
      onOpenChange={onOpenChange}
      className="viewer-join-dialog"
      label={`Entrar em ${channel.name}`}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <header className="dialog-heading">
          <div>
            <span>{channel.category}</span>
            <Dialog.Title>Entrar em {channel.name}</Dialog.Title>
            <Dialog.Description>{channel.description}</Dialog.Description>
          </div>
          <DialogCloseButton />
        </header>
        <div className="profile-editor">
          <div className="profile-avatar-row">
            <Avatar name={profile.name || "Espectador"} src={profile.avatar} />
            <label className="secondary-button">
              Adicionar imagem
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={onAvatarChange}
              />
            </label>
          </div>
          <label htmlFor="profile-name">
            Nome
            <input
              id="profile-name"
              value={profile.name}
              required
              minLength={2}
              maxLength={32}
              autoComplete="name"
              onChange={(event) =>
                onProfileChange({ ...profile, name: event.target.value })
              }
              placeholder="Como devemos chamar você?"
            />
          </label>
        </div>
        <button type="submit" className="dialog-primary-button">
          Entrar para assistir
        </button>
      </form>
    </RoomDialog>
  );
}
