import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomPeers } from '@/lib/db/schema'
import { accessErrorResponse, requireRoomAccess } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

export async function POST(request: Request) {
  try {
    const access = await requireRoomAccess(request, 'main')
    const { peerId } = await request.json().catch(() => ({}))
    if (typeof peerId !== 'string') return roomJson(request, { error: 'peerId obrigatório' }, { status: 400 })
    const peer = await db.update(roomPeers).set({ status: 'offline', lastSeenAt: new Date() }).where(and(eq(roomPeers.peerId, peerId), eq(roomPeers.userId, access.user.id), eq(roomPeers.roomId, 'main'))).returning({ peerId: roomPeers.peerId })
    if (!peer[0]) return roomJson(request, { error: 'Peer não pertence à sua sessão' }, { status: 403 })
    return roomJson(request, { ok: true })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[room] Leave failed', error)
    return roomJson(request, { error: 'Não foi possível sair da sala' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
