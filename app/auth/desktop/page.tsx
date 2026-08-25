import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { desktopAuthCodes } from '@/lib/db/schema'
import { hashSecret, resolveIdentity } from '@/lib/auth/identity'

export const dynamic = 'force-dynamic'

export default async function DesktopAuthPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state = '' } = await searchParams
  if (!/^[a-zA-Z0-9_-]{32,180}$/.test(state)) return <DesktopAuthMessage title="Solicitação inválida" message="Volte ao aplicativo e tente entrar novamente." />
  const identity = await resolveIdentity()
  if (!identity) redirect(`/login?next=${encodeURIComponent(`/auth/desktop?state=${state}`)}`)

  const code = randomBytes(32).toString('base64url')
  await db.insert(desktopAuthCodes).values({
    codeHash: hashSecret(code),
    stateHash: hashSecret(state),
    userId: identity.user.id,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  })
  const callbackUrl = `neegy://auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`

  return (
    <main className="min-h-dvh bg-black px-5 py-12 text-white">
      <section className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-lg items-center justify-center">
        <div className="w-full rounded-3xl bg-[#1b1b1b] p-8 text-center shadow-2xl sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Screen Gole Desktop</p>
          <h1 className="mt-4 text-3xl font-bold">Login concluído</h1>
          <p className="mt-3 leading-7 text-white/65">Abra o Screen Gole para finalizar esta sessão segura.</p>
          <a href={callbackUrl} className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#6d3bff] px-5 font-bold text-white transition hover:bg-[#7c50ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Voltar ao aplicativo</a>
          <p className="mt-5 text-xs text-white/45">O código expira em cinco minutos e só pode ser utilizado uma vez.</p>
        </div>
      </section>
    </main>
  )
}

function DesktopAuthMessage({ title, message }: { title: string; message: string }) {
  return <main className="grid min-h-dvh place-items-center bg-black p-6 text-white"><section className="max-w-md rounded-3xl bg-[#1b1b1b] p-8 text-center"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-3 text-white/65">{message}</p></section></main>
}
