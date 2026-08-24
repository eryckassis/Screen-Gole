import { and, asc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomSignals } from '@/lib/db/schema'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    if (!['offer', 'answer', 'ice'].includes(body.type) || typeof body.roomId !== 'string' || typeof body.fromPeerId !== 'string' || typeof body.toPeerId !== 'string' || !body.payload) return roomJson(request, { error: 'Sinal inválido' }, { status: 400 })
    if (JSON.stringify(body.payload).length > 20000) return roomJson(request, { error: 'Sinal grande demais' }, { status: 413 })
    await db.insert(roomSignals).values({ roomId: 'main', fromPeerId: body.fromPeerId, toPeerId: body.toPeerId, signalType: body.type, payload: body.payload })
    return roomJson(request, { ok: true })
  } catch (error) {
    console.error('[room] Signal registration failed', error)
    return roomJson(request, { error: 'Não foi possível registrar o sinal' }, { status: 503 })
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const peerId = url.searchParams.get('peerId')
    const after = Number(url.searchParams.get('after') || 0)
    if (!peerId) return roomJson(request, { error: 'peerId obrigatório' }, { status: 400 })
    const rows = await db.select().from(roomSignals).where(and(eq(roomSignals.roomId, 'main'), eq(roomSignals.toPeerId, peerId), gt(roomSignals.id, after))).orderBy(asc(roomSignals.id)).limit(200)
    return roomJson(request, { signals: rows })
  } catch (error) {
    console.error('[room] Signal lookup failed', error)
    return roomJson(request, { error: 'Não foi possível consultar os sinais' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
