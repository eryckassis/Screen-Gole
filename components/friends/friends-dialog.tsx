'use client'

import { Check, Clock3, Radio, Search, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { DialogCloseButton, RoomDialog } from '@/components/room/room-ui'

type FriendRoom = {
  roomId: string
  slug: string
  name: string
  avatar: string | null
  isLive: boolean
}

type Person = {
  userId: string
  displayName: string
  displayTag: string
  avatarUrl: string | null
  online: boolean
  rooms?: FriendRoom[]
}

type FriendsPayload = {
  friends: Person[]
  incoming: Person[]
  outgoing: Person[]
  suggestions: Person[]
}

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>

function PersonAvatar({ person, size = 'size-11' }: { person: Person; size?: string }) {
  return (
    <span className={`relative grid ${size} shrink-0 place-items-center overflow-visible rounded-full bg-white/10 text-sm font-extrabold text-white`}>
      <span className="grid size-full overflow-hidden rounded-full place-items-center">
        {person.avatarUrl ? (
          <img src={person.avatarUrl} alt={`Foto de ${person.displayName}`} width={56} height={56} className="size-full object-cover" />
        ) : (
          person.displayName.slice(0, 1).toUpperCase()
        )}
      </span>
      <span className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-[#151515] ${person.online ? 'bg-emerald-400' : 'bg-[#555]'}`} aria-label={person.online ? 'Online' : 'Offline'} />
    </span>
  )
}

export function FriendsDialog({
  open,
  onOpenChange,
  request,
  onJoinRoom,
  onIncomingCountChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: ApiRequest
  onJoinRoom: (room: FriendRoom) => void
  onIncomingCountChange: (count: number) => void
}) {
  const [query, setQuery] = useState('')
  const [payload, setPayload] = useState<FriendsPayload>({ friends: [], incoming: [], outgoing: [], suggestions: [] })
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async (search = query.trim(), quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const result = await request<FriendsPayload>(`/api/friends${search.length >= 2 ? `?q=${encodeURIComponent(search)}` : ''}`)
      setPayload(result)
      onIncomingCountChange(result.incoming.length)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar seus amigos')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [onIncomingCountChange, query, request])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => void refresh(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [open, query, refresh])

  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => void refresh(query.trim(), true), 3000)
    return () => window.clearInterval(timer)
  }, [open, query, refresh])

  async function mutate(targetUserId: string, init: RequestInit) {
    setActionId(targetUserId)
    setError('')
    try {
      await request('/api/friends', init)
      await refresh(query.trim(), true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir esta ação')
    } finally {
      setActionId('')
    }
  }

  const sendRequest = (targetUserId: string) => mutate(targetUserId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  })
  const answerRequest = (targetUserId: string, action: 'accept' | 'decline') => mutate(targetUserId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId, action }),
  })
  const removeFriend = (targetUserId: string) => mutate(targetUserId, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  })

  const searching = query.trim().length >= 2
  const liveFriends = payload.friends.filter((friend) => friend.rooms?.some((room) => room.isLive))

  return (
    <RoomDialog open={open} onOpenChange={onOpenChange} className="!w-[min(720px,100%)] !overflow-hidden !bg-[#1b1b1b]" label="Amigos e busca global">
      <section className="flex max-h-[min(760px,calc(100dvh-48px))] min-h-[560px] flex-col bg-[#1b1b1b] text-white">
        <header className="flex items-start justify-between gap-5 border-b border-white/10 px-6 py-5 sm:px-7">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-white/40">Rede Screen Gole</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Encontre seus amigos</h2>
            <p className="mt-1 text-sm leading-6 text-white/50">Perfis, pedidos e salas ao vivo atualizados automaticamente.</p>
          </div>
          <DialogCloseButton />
        </header>

        <div className="border-b border-white/10 px-6 py-4 sm:px-7">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" size={19} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar nome ou Nome#1234"
              aria-label="Pesquisar usuários globalmente"
              className="min-h-12 w-full rounded-2xl border border-white/10 bg-[#0b0b0b] pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/30 focus:ring-2 focus:ring-white/10"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white" aria-label="Limpar pesquisa">
                <X size={16} />
              </button>
            ) : null}
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-7">
          {error ? <p className="mb-4 rounded-xl border border-red-400/15 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">{error}</p> : null}

          {payload.incoming.length ? (
            <section className="mb-7" aria-labelledby="friend-requests-title">
              <div className="mb-3 flex items-center justify-between">
                <h3 id="friend-requests-title" className="text-xs font-extrabold uppercase tracking-[.14em] text-white/50">Pedidos recebidos</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-black">{payload.incoming.length}</span>
              </div>
              <div className="space-y-2">
                {payload.incoming.map((person) => (
                  <article key={person.userId} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0b0b] p-3">
                    <PersonAvatar person={person} />
                    <div className="min-w-0 flex-1"><strong className="block truncate text-sm">{person.displayName}</strong><span className="block truncate text-xs text-white/40">{person.displayTag}</span></div>
                    <button type="button" disabled={actionId === person.userId} onClick={() => void answerRequest(person.userId, 'decline')} className="grid size-9 place-items-center rounded-xl bg-white/5 text-white/45 hover:bg-red-500/15 hover:text-red-200 disabled:opacity-40" aria-label={`Recusar pedido de ${person.displayName}`}><X size={16} /></button>
                    <button type="button" disabled={actionId === person.userId} onClick={() => void answerRequest(person.userId, 'accept')} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-extrabold text-black hover:bg-white/85 disabled:opacity-40"><Check size={15} />Aceitar</button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {searching ? (
            <section aria-labelledby="global-results-title">
              <h3 id="global-results-title" className="mb-3 text-xs font-extrabold uppercase tracking-[.14em] text-white/50">Resultados globais</h3>
              {loading ? <p className="rounded-2xl bg-[#0b0b0b] px-4 py-8 text-center text-sm text-white/40">Buscando usuários…</p> : payload.suggestions.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {payload.suggestions.map((person) => (
                    <article key={person.userId} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0b0b] p-3">
                      <PersonAvatar person={person} />
                      <div className="min-w-0 flex-1"><strong className="block truncate text-sm">{person.displayName}</strong><span className="block truncate text-xs text-white/40">{person.displayTag}</span></div>
                      <button type="button" disabled={actionId === person.userId} onClick={() => void sendRequest(person.userId)} className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-black hover:bg-white/85 disabled:opacity-40" aria-label={`Adicionar ${person.displayName} como amigo`} title="Enviar pedido"><UserPlus size={17} /></button>
                    </article>
                  ))}
                </div>
              ) : <p className="rounded-2xl border border-dashed border-white/15 bg-[#0b0b0b] px-4 py-8 text-center text-sm text-white/40">Nenhum usuário disponível com esse nome.</p>}
            </section>
          ) : (
            <div className="space-y-7">
              {liveFriends.length ? (
                <section aria-labelledby="friends-live-title">
                  <h3 id="friends-live-title" className="mb-3 text-xs font-extrabold uppercase tracking-[.14em] text-white/50">Amigos transmitindo</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {liveFriends.flatMap((friend) => (friend.rooms || []).filter((room) => room.isLive).map((room) => (
                      <button key={`${friend.userId}-${room.roomId}`} type="button" onClick={() => onJoinRoom(room)} className="group relative min-h-36 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0b] p-4 text-left hover:border-white/25">
                        {room.avatar ? <img src={room.avatar} alt="" width={320} height={160} className="absolute inset-0 size-full object-cover opacity-30 transition duration-300 group-hover:scale-105 group-hover:opacity-40" /> : null}
                        <span className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
                        <span className="relative flex h-full flex-col justify-between">
                          <span className="grid size-10 place-items-center rounded-full bg-black/65 backdrop-blur"><Radio size={18} /></span>
                          <span><strong className="block text-base">{room.name}</strong><small className="mt-1 block text-white/60">{friend.displayName} está ao vivo · Entrar</small></span>
                        </span>
                      </button>
                    ))) }
                  </div>
                </section>
              ) : null}

              <section aria-labelledby="friends-list-title">
                <div className="mb-3 flex items-center justify-between">
                  <h3 id="friends-list-title" className="text-xs font-extrabold uppercase tracking-[.14em] text-white/50">Seus amigos</h3>
                  <span className="text-xs text-white/35">{payload.friends.length} amigo(s)</span>
                </div>
                {payload.friends.length ? (
                  <div className="space-y-2">
                    {payload.friends.map((person) => {
                      const availableRoom = person.rooms?.[0]
                      return (
                        <article key={person.userId} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0b0b] p-3">
                          <PersonAvatar person={person} size="size-12" />
                          <div className="min-w-0 flex-1"><strong className="block truncate text-sm">{person.displayName}</strong><span className="block truncate text-xs text-white/40">{person.displayTag} · {person.online ? 'Online' : 'Offline'}</span></div>
                          {availableRoom ? <button type="button" onClick={() => onJoinRoom(availableRoom)} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/15"><Radio size={14} />{availableRoom.isLive ? 'Ao vivo' : availableRoom.name}</button> : null}
                          <button type="button" disabled={actionId === person.userId} onClick={() => void removeFriend(person.userId)} className="grid size-9 shrink-0 place-items-center rounded-xl text-white/30 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-40" aria-label={`Remover amizade com ${person.displayName}`}><Trash2 size={15} /></button>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-white/15 bg-[#0b0b0b] px-6 text-center">
                    <div><Users className="mx-auto text-white/30" size={25} /><strong className="mt-3 block text-sm">Sua lista ainda está vazia</strong><span className="mt-1 block text-xs leading-5 text-white/40">Pesquise acima para encontrar quem já criou uma conta.</span></div>
                  </div>
                )}
              </section>

              {payload.outgoing.length ? (
                <section aria-labelledby="sent-requests-title">
                  <h3 id="sent-requests-title" className="mb-3 text-xs font-extrabold uppercase tracking-[.14em] text-white/50">Pedidos enviados</h3>
                  <div className="flex flex-wrap gap-2">
                    {payload.outgoing.map((person) => <span key={person.userId} className="inline-flex items-center gap-2 rounded-full bg-[#0b0b0b] px-3 py-2 text-xs text-white/55"><Clock3 size={13} />{person.displayTag}</span>)}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </RoomDialog>
  )
}
