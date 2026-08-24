import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { MonitorUp, Radio, Users } from "lucide-react";
import { RoomApp, type RoomMode } from "../components/room-app";
import { windowsNativeCapture } from "./native-capture";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://screen-gole.vercel.app";
const DESKTOP_INVITE_URL = `${API_BASE_URL}/s/main`;

function modeFromDeepLinks(urls: string[] | null): RoomMode | null {
  for (const value of urls || []) {
    try {
      const url = new URL(value);
      if (
        url.protocol === "neegy:" &&
        url.hostname === "watch" &&
        url.searchParams.get("room") === "main"
      )
        return "viewer";
    } catch {
      // Ignore arguments that are not valid Screen Gole deep links.
    }
  }
  return null;
}

export function DesktopApp() {
  const [mode, setMode] = useState<RoomMode | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const currentMode = modeFromDeepLinks(
        await getCurrent().catch(() => null),
      );
      if (!disposed && currentMode) setMode(currentMode);

      unlisten = await onOpenUrl((urls) => {
        const nextMode = modeFromDeepLinks(urls);
        if (nextMode) setMode(nextMode);
      }).catch(() => undefined);
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (!mode) {
    return (
      <main className="desktop-entry">
        <section
          className="desktop-entry-card"
          aria-labelledby="desktop-entry-title"
        >
          <div className="desktop-entry-brand">
            <Radio size={22} /> Screen Gole
          </div>
          <p className="desktop-entry-kicker">Aplicativo para Windows</p>
          <h1 id="desktop-entry-title">Como você quer entrar?</h1>
          <p className="desktop-entry-copy">
            Transmita sua tela ou assista à sala principal sem abrir o
            navegador.
          </p>
          <div className="desktop-mode-grid">
            <button type="button" onClick={() => setMode("host")}>
              <MonitorUp size={26} />
              <span>
                <strong>Transmitir</strong>
                <small>Compartilhar tela e áudio</small>
              </span>
            </button>
            <button type="button" onClick={() => setMode("viewer")}>
              <Users size={26} />
              <span>
                <strong>Assistir</strong>
                <small>Entrar como espectador</small>
              </span>
            </button>
          </div>
          <p className="desktop-entry-footnote">
            A conexão com a sala ainda requer internet.
          </p>
        </section>
      </main>
    );
  }

  return (
    <RoomApp
      key={mode}
      apiBaseUrl={API_BASE_URL}
      initialMode={mode}
      inviteUrl={DESKTOP_INVITE_URL}
      nativeCapture={windowsNativeCapture}
      setNativeFullscreen={(fullscreen) =>
        getCurrentWindow().setFullscreen(fullscreen)
      }
    />
  );
}
