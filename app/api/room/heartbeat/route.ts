import { NextResponse } from 'next/server'
import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomPeers, roomSessions } from '@/lib/db/schema'

export async function POST(request: Request) {
  const { peerId, role, live } = await request.json().catch(() => ({}))
  if (typeof peerId !== 'string') return NextResponse.json({ error: 'peerId obrigatório' }, { status: 400 })
  await db.update(roomPeers).set({ status: 'active', lastSeenAt: new Date() }).where(and(eq(roomPeers.peerId, peerId), eq(roomPeers.roomId, 'main')))
  if (role === 'host') await db.update(roomSessions).set({ status: live ? 'live' : 'idle', updatedAt: new Date() }).where(eq(roomSessions.roomId, 'main'))
  await db.update(roomPeers).set({ status: 'offline' }).where(lt(roomPeers.lastSeenAt, new Date(Date.now() - 30000)))
  return NextResponse.json({ ok: true })
}
