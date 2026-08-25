import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LogOut, MonitorUp, Users } from "lucide-react";
import { LoginScreen } from "../components/auth/login-screen";
import { RoomApp, type RoomMode } from "../components/room-app";
import { windowsNativeCapture } from "./native-capture";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://screen-gole.vercel.app";
const DESKTOP_INVITE_URL = `${API_BASE_URL}/s/main`;
const TOKEN_KEY = "desktop-session";
const STATE_KEY = "desktop-oauth-state";

type DesktopUser = { id: string; displayName: string; displayTag: string; avatarUrl: string | null };
type DesktopSession = { token: string; user: DesktopUser; memberships: { roomId: string; role: string }[] };
type DesktopRoom = { roomId: string; slug: string; name: string; isLive: boolean };

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const storeSecret = (key: string, value: string) => invoke<void>("store_secure_value", { key, value });
const loadSecret = (key: string) => invoke<string | null>("load_secure_value", { key });
const deleteSecret = (key: string) => invoke<void>("delete_secure_value", { key });

async function requestJson<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Falha ao conectar com o Screen Gole");
  return payload as T;
}

function roomModeFromDeepLinks(urls: string[] | null): RoomMode | null {
  for (const value of urls || []) try {
    const url = new URL(value);
    if (url.protocol === "neegy:" && url.hostname === "watch" && url.searchParams.get("room") === "main") return "viewer";
  } catch { /* Ignora argumentos que não são links. */ }
  return null;
}

function authCallbackFromDeepLinks(urls: string[] | null) {
  for (const value of urls || []) try {
    const url = new URL(value);
    if (url.protocol === "neegy:" && url.hostname === "auth" && url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (code && state) return { code, state };
    }
  } catch { /* Ignora argumentos que não são links. */ }
  return null;
}

export function DesktopApp() {
  const [session, setSession] = useState<DesktopSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [mode, setMode] = useState<RoomMode | null>(null);
  const [availableRooms, setAvailableRooms] = useState<DesktopRoom[]>([]);

  const completeDesktopLogin = useCallback(async (code: string, state: string) => {
    const expectedState = await loadSecret(STATE_KEY);
    if (!expectedState || expectedState !== state) throw new Error("A validação de segurança do login falhou. Tente novamente.");
    const nextSession = await requestJson<DesktopSession>("/api/auth/desktop/exchange", { method: "POST", body: JSON.stringify({ code, state }) });
    await storeSecret(TOKEN_KEY, nextSession.token);
    await deleteSecret(STATE_KEY);
    setSession(nextSession);
    setLoginError("");
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const initialUrls = await getCurrent().catch(() => null);
      const requestedMode = roomModeFromDeepLinks(initialUrls);
      if (!disposed && requestedMode) setMode(requestedMode);
      const initialCallback = authCallbackFromDeepLinks(initialUrls);
      try {
        if (initialCallback) await completeDesktopLogin(initialCallback.code, initialCallback.state);
        else {
          const token = await loadSecret(TOKEN_KEY);
          if (token) {
            const profile = await requestJson<{ user: DesktopUser; memberships: { roomId: string; role: string }[] }>("/api/me", {}, token);
            if (!disposed) setSession({ token, ...profile });
          }
        }
      } catch (error) {
        await deleteSecret(TOKEN_KEY).catch(() => undefined);
        if (!disposed) setLoginError(error instanceof Error ? error.message : "Sua sessão expirou. Entre novamente.");
      } finally { if (!disposed) setLoading(false); }

      unlisten = await onOpenUrl((urls) => {
        const nextMode = roomModeFromDeepLinks(urls);
        if (nextMode) setMode(nextMode);
        const callback = authCallbackFromDeepLinks(urls);
        if (callback) {
          setLoading(true);
          void completeDesktopLogin(callback.code, callback.state)
            .catch((error) => setLoginError(error instanceof Error ? error.message : "Não foi possível concluir o login."))
            .finally(() => setLoading(false));
        }
      }).catch(() => undefined);
    })();
    return () => { disposed = true; unlisten?.(); };
  }, [completeDesktopLogin]);

  useEffect(() => {
    const token = session?.token;
    if (!token) return;
    let disposed = false;

    const refreshAccess = async () => {
      try {
        const [profile, directory] = await Promise.all([
          requestJson<{ user: DesktopUser; memberships: { roomId: string; role: string }[] }>("/api/me", {}, token),
          requestJson<{ rooms: DesktopRoom[] }>("/api/rooms", {}, token),
        ]);
        if (disposed) return;
        setSession((current) => current?.token === token ? { token, ...profile } : current);
        setAvailableRooms(directory.rooms || []);
      } catch {
        // Uma falha temporária não encerra uma sessão ainda válida.
      }
    };

    void refreshAccess();
    const timer = window.setInterval(() => void refreshAccess(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [session?.token]);

  if (loading) return <main className="grid min-h-dvh place-items-center bg-black text-white"><span className="size-8 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-label="Carregando" /></main>;

  if (!session) return <LoginScreen initialError={loginError} onContinue={async () => {
    const state = randomState();
    await storeSecret(STATE_KEY, state);
    const { authUrl } = await requestJson<{ authUrl: string }>("/api/auth/desktop/start", { method: "POST", body: JSON.stringify({ state }) });
    await openUrl(authUrl);
  }} />;

  const membership = session.memberships.find((item) => item.roomId === "main");
  const isOwner = membership?.role === "owner";
  const mainRoom = availableRooms.find((room) => room.roomId === "main");
  if (!membership) return <main className="grid min-h-dvh place-items-center bg-black p-6 text-white"><section className="max-w-lg rounded-3xl bg-[#1b1b1b] p-9 text-center"><p className="text-xs font-bold uppercase tracking-[.18em] text-white/45">{session.user.displayTag}</p><h1 className="mt-4 text-3xl font-bold">Aguardando acesso à sala</h1><p className="mt-3 leading-7 text-white/60">Peça ao proprietário para adicionar sua tag. Esta tela atualiza automaticamente quando o acesso for liberado.</p><span className="mx-auto mt-6 block size-5 animate-spin rounded-full border-2 border-white/20 border-t-white" aria-label="Atualizando salas" /><LogoutButton token={session.token} onDone={() => setSession(null)} /></section></main>;

  if (!mode) return <main className="desktop-entry"><section className="desktop-entry-card" aria-labelledby="desktop-entry-title"><div className="desktop-entry-brand"><img src="/icon.svg" alt="" width={42} height={42} />Screen Gole</div><p className="desktop-entry-kicker">{session.user.displayTag}</p><h1 id="desktop-entry-title">{mainRoom?.name || "Mesa Principal"}</h1><p className="desktop-entry-copy">{mainRoom?.isLive ? "Transmissão ao vivo — entre para assistir agora." : "Sala permanente disponível neste aplicativo."}</p><div className="desktop-mode-grid">{isOwner && <button type="button" onClick={() => setMode("host")}><MonitorUp size={26} /><span><strong>Transmitir</strong><small>Compartilhar tela e áudio</small></span></button>}<button type="button" onClick={() => setMode("viewer")}><Users size={26} /><span><strong>Assistir</strong><small>Entrar como espectador</small></span></button></div><LogoutButton token={session.token} onDone={() => setSession(null)} /></section></main>;

  return <RoomApp key={mode} apiBaseUrl={API_BASE_URL} accessToken={session.token} initialMode={isOwner ? mode : "viewer"} initialProfile={{ name: session.user.displayName, avatar: session.user.avatarUrl || "" }} initialTag={session.user.displayTag} inviteUrl={DESKTOP_INVITE_URL} nativeCapture={isOwner ? windowsNativeCapture : undefined} setNativeFullscreen={(fullscreen) => getCurrentWindow().setFullscreen(fullscreen)} />;
}

function LogoutButton({ token, onDone }: { token: string; onDone: () => void }) {
  return <button type="button" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-white/55 transition hover:text-white" onClick={() => void requestJson("/api/auth/desktop/logout", { method: "POST" }, token).catch(() => undefined).finally(async () => { await deleteSecret(TOKEN_KEY).catch(() => undefined); onDone(); })}><LogOut size={16} />Sair desta conta</button>;
}
