import { and, asc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomMemberships, roomPeers, roomSignals } from '@/lib/db/schema'
import { accessErrorResponse, requireRoomAccess } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

const ROOM_ID = 'main'

async function ownedPeer(peerId: string, userId: string) {
  return (await db.select({ peerId: roomPeers.peerId }).from(roomPeers).where(and(eq(roomPeers.peerId, peerId), eq(roomPeers.userId, userId), eq(roomPeers.roomId, ROOM_ID))).limit(1))[0]
}

export async function POST(request: Request) {
  try {
    const access = await requireRoomAccess(request, ROOM_ID)
    const body = await request.json().catch(() => ({}))
    if (!['offer', 'answer', 'ice'].includes(body.type) || typeof body.fromPeerId !== 'string' || typeof body.toPeerId !== 'string' || !body.payload) return roomJson(request, { error: 'Sinal inválido' }, { status: 400 })
    if (JSON.stringify(body.payload).length > 20000) return roomJson(request, { error: 'Sinal grande demais' }, { status: 413 })
    if (!await ownedPeer(body.fromPeerId, access.user.id)) return roomJson(request, { error: 'peerId não pertence à sua sessão' }, { status: 403 })
    const target = (await db.select({ peerId: roomPeers.peerId }).from(roomPeers).innerJoin(roomMemberships, and(eq(roomMemberships.userId, roomPeers.userId), eq(roomMemberships.roomId, roomPeers.roomId))).where(and(eq(roomPeers.peerId, body.toPeerId), eq(roomPeers.roomId, ROOM_ID))).limit(1))[0]
    if (!target) return roomJson(request, { error: 'Peer de destino inválido' }, { status: 403 })
    await db.insert(roomSignals).values({ roomId: ROOM_ID, fromPeerId: body.fromPeerId, toPeerId: body.toPeerId, signalType: body.type, payload: body.payload })
    return roomJson(request, { ok: true })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[room] Signal registration failed', error)
    return roomJson(request, { error: 'Não foi possível registrar o sinal' }, { status: 503 })
  }
}

export async function GET(request: Request) {
  try {
    const access = await requireRoomAccess(request, ROOM_ID)
    const url = new URL(request.url)
    const peerId = url.searchParams.get('peerId')
    const after = Math.max(0, Number(url.searchParams.get('after') || 0))
    if (!peerId) return roomJson(request, { error: 'peerId obrigatório' }, { status: 400 })
    if (!await ownedPeer(peerId, access.user.id)) return roomJson(request, { error: 'peerId não pertence à sua sessão' }, { status: 403 })
    const rows = await db.select().from(roomSignals).where(and(eq(roomSignals.roomId, ROOM_ID), eq(roomSignals.toPeerId, peerId), gt(roomSignals.id, after))).orderBy(asc(roomSignals.id)).limit(200)
    return roomJson(request, { signals: rows })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[room] Signal lookup failed', error)
    return roomJson(request, { error: 'Não foi possível consultar os sinais' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
