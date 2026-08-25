'use client'

import Link from 'next/link'
import { Radio, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type AvailableRoom = {
  roomId: string
  slug: string
  name: string
  category: string
  description: string
  avatar: string | null
  role: string
  isLive: boolean
}

export function RoomAccessLobby({ displayTag }: { displayTag: string }) {
  const [rooms, setRooms] = useState<AvailableRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshRooms = useCallback(async () => {
    try {
      const response = await fetch('/api/rooms', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const payload = (await response.json()) as {
        rooms?: AvailableRoom[]
        error?: string
      }
      if (!response.ok) throw new Error(payload.error || 'Falha ao consultar as salas')
      setRooms(payload.rooms || [])
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar suas salas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshRooms()
    const timer = window.setInterval(() => void refreshRooms(), 3000)
    return () => window.clearInterval(timer)
  }, [refreshRooms])

  return (
    <main className="min-h-dvh bg-black px-5 py-8 text-white sm:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-3xl flex-col justify-center">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#1b1b1b] shadow-2xl shadow-black">
          <header className="border-b border-white/10 px-6 py-6 sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-white/45">{displayTag}</p>
            <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Suas transmissões</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">
              Quando o proprietário adicionar você, a sala aparece aqui automaticamente. Depois, basta clicar para assistir.
            </p>
          </header>

          <div className="p-4 sm:p-6" aria-live="polite">
            {rooms.length ? (
              <div className="space-y-2">
                {rooms.map((room) => (
                  <Link
                    key={room.roomId}
                    href={`/s/${room.slug}`}
                    className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-[#0b0b0b] p-4 transition hover:border-white/25 hover:bg-[#121212] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/10 text-white">
                      {room.avatar ? (
                        <img src={room.avatar} alt="" className="size-full object-cover" />
                      ) : (
                        <Radio size={23} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <small className="block truncate text-[10px] font-bold uppercase tracking-[.16em] text-white/40">{room.category}</small>
                      <strong className="mt-1 block truncate text-base text-white">{room.name}</strong>
                      <span className="mt-1 block truncate text-xs text-white/45">{room.description}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${room.isLive ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/45'}`}>
                      {room.isLive ? 'Ao vivo' : 'Disponível'}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-white/15 bg-[#0b0b0b] px-6 text-center">
                <div>
                  <RefreshCw className={`mx-auto text-white/35 ${loading ? 'animate-spin' : ''}`} size={22} />
                  <h2 className="mt-4 text-lg font-bold">Aguardando acesso à sala</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/50">
                    Envie sua tag ao proprietário ou use um convite válido. Não precisa recarregar esta página.
                  </p>
                </div>
              </div>
            )}

            {error && <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}
          </div>
        </section>
      </div>
    </main>
  )
}
