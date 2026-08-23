import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomPeers, roomSessions } from '@/lib/db/schema'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

export async function POST(request: Request) {
  try {
    const { peerId, role, live } = await request.json().catch(() => ({}))
    if (typeof peerId !== 'string') return roomJson(request, { error: 'peerId obrigatório' }, { status: 400 })
    await db.update(roomPeers).set({ status: 'active', lastSeenAt: new Date() }).where(and(eq(roomPeers.peerId, peerId), eq(roomPeers.roomId, 'main')))
    if (role === 'host') await db.update(roomSessions).set({ status: live ? 'live' : 'idle', updatedAt: new Date() }).where(eq(roomSessions.roomId, 'main'))
    await db.update(roomPeers).set({ status: 'offline' }).where(lt(roomPeers.lastSeenAt, new Date(Date.now() - 30000)))
    return roomJson(request, { ok: true })
  } catch (error) {
    console.error('[room] Heartbeat failed', error)
    return roomJson(request, { error: 'Não foi possível atualizar a sala' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
