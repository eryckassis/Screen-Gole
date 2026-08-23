import { NextResponse } from 'next/server'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomSignals } from '@/lib/db/schema'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  if (!['offer', 'answer', 'ice'].includes(body.type) || typeof body.roomId !== 'string' || typeof body.fromPeerId !== 'string' || typeof body.toPeerId !== 'string' || !body.payload) return NextResponse.json({ error: 'Sinal inválido' }, { status: 400 })
  if (JSON.stringify(body.payload).length > 20000) return NextResponse.json({ error: 'Sinal grande demais' }, { status: 413 })
  await db.insert(roomSignals).values({ roomId: 'main', fromPeerId: body.fromPeerId, toPeerId: body.toPeerId, signalType: body.type, payload: body.payload })
  return NextResponse.json({ ok: true })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const peerId = url.searchParams.get('peerId')
  const after = Number(url.searchParams.get('after') || 0)
  if (!peerId) return NextResponse.json({ error: 'peerId obrigatório' }, { status: 400 })
  const rows = await db.select().from(roomSignals).where(and(eq(roomSignals.roomId, 'main'), eq(roomSignals.toPeerId, peerId), gt(roomSignals.id, after)))
  return NextResponse.json({ signals: rows })
}
