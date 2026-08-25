import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomPeers, roomSessions } from '@/lib/db/schema'
import { accessErrorResponse, requireRoomAccess } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

export async function POST(request: Request) {
  try {
    const access = await requireRoomAccess(request, 'main')
    const { peerId, live } = await request.json().catch(() => ({}))
    if (typeof peerId !== 'string') return roomJson(request, { error: 'peerId obrigatório' }, { status: 400 })
    if (live && access.role !== 'owner') return roomJson(request, { error: 'Somente o proprietário pode iniciar uma transmissão' }, { status: 403 })
    const now = new Date()
    const peer = await db.update(roomPeers).set({ status: access.role === 'owner' && live ? 'live' : 'active', lastSeenAt: now }).where(and(eq(roomPeers.peerId, peerId), eq(roomPeers.userId, access.user.id), eq(roomPeers.roomId, 'main'))).returning({ peerId: roomPeers.peerId })
    if (!peer[0]) return roomJson(request, { error: 'Peer não pertence à sua sessão' }, { status: 403 })
    if (access.role === 'owner') await db.update(roomSessions).set({ status: live ? 'live' : 'idle', updatedAt: now, expiresAt: new Date(now.getTime() + 86400000) }).where(eq(roomSessions.roomId, 'main'))
    await db.update(roomPeers).set({ status: 'offline' }).where(lt(roomPeers.lastSeenAt, new Date(Date.now() - 30000)))
    return roomJson(request, { ok: true })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[room] Heartbeat failed', error)
    return roomJson(request, { error: 'Não foi possível atualizar a sala' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
