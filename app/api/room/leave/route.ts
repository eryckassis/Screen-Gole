import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomPeers } from '@/lib/db/schema'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

export async function POST(request: Request) {
  try {
    const { peerId } = await request.json().catch(() => ({}))
    if (typeof peerId !== 'string') return roomJson(request, { error: 'peerId obrigatório' }, { status: 400 })
    await db.update(roomPeers).set({ status: 'offline', lastSeenAt: new Date() }).where(and(eq(roomPeers.peerId, peerId), eq(roomPeers.roomId, 'main')))
    return roomJson(request, { ok: true })
  } catch (error) {
    console.error('[room] Leave failed', error)
    return roomJson(request, { error: 'Não foi possível sair da sala' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
