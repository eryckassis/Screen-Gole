import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomPeers } from '@/lib/db/schema'

export async function POST(request: Request) {
  const { peerId } = await request.json().catch(() => ({}))
  if (typeof peerId !== 'string') return NextResponse.json({ error: 'peerId obrigatório' }, { status: 400 })
  await db.update(roomPeers).set({ status: 'offline', lastSeenAt: new Date() }).where(and(eq(roomPeers.peerId, peerId), eq(roomPeers.roomId, 'main')))
  return NextResponse.json({ ok: true })
}
