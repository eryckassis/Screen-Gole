"use client";

import { useState } from "react";

type LoginScreenProps = {
  onContinue: () => Promise<void>;
  initialError?: string;
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
      <path fill="#fff" d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z" />
      <path fill="#fff" fillOpacity=".8" d="M12 22c2.7 0 5-.9 6.8-2.3l-3.3-2.6c-.9.6-2.1 1-3.5 1a6 6 0 0 1-5.6-4.1H3v2.7A10.3 10.3 0 0 0 12 22Z" />
      <path fill="#fff" fillOpacity=".65" d="M6.4 14a6.2 6.2 0 0 1 0-4V7.3H3a10 10 0 0 0 0 9.4L6.4 14Z" />
      <path fill="#fff" fillOpacity=".9" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3 7.3L6.4 10A6 6 0 0 1 12 5.9Z" />
    </svg>
  );
}

export function LoginScreen({ onContinue, initialError = "" }: LoginScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  async function continueWithGoogle() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await onContinue();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar com o Google.");
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center overflow-y-auto bg-black px-5 py-10 text-[#151515] sm:px-8">
      <section className="w-full max-w-[590px]" aria-labelledby="login-title">
        <h1 id="login-title" className="mb-7 text-center font-[family-name:var(--font-login)] text-[clamp(4.5rem,13vw,8.5rem)] font-normal leading-[0.78] tracking-[-0.06em] text-white">
          Login
        </h1>
        <div className="rounded-[28px] bg-[#f4f4f4] p-7 shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:p-11">
          <div className="mx-auto max-w-[430px] text-center">
            <h2 className="text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">Entre no Screen Gole</h2>
            <p className="mt-3 text-sm leading-6 text-black/60 sm:text-base">Use sua conta Google para acessar suas salas permanentes no site e no aplicativo.</p>
          </div>
          {error && (
            <div className="mt-7 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">
              {error}
            </div>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void continueWithGoogle()}
            className="mt-8 flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border border-transparent bg-[#6d3bff] px-5 text-base font-bold text-white shadow-[0_12px_30px_rgba(109,59,255,0.28)] transition hover:bg-[#7a4aff] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6d3bff]/30 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? <span className="size-5 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" /> : <GoogleMark />}
            {loading ? "Abrindo Google…" : error ? "Tentar novamente com Google" : "Continuar com Google"}
          </button>
          <p className="mt-5 text-center text-xs leading-5 text-black/45">O primeiro login cria sua conta automaticamente. Não usamos senha própria.</p>
        </div>
      </section>
    </main>
  );
}
