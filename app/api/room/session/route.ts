import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomPeers, roomSessions } from '@/lib/db/schema'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

const ROOM_ID = 'main'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const role = body.role === 'host' ? 'host' : 'viewer'
    const peerId = typeof body.peerId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(body.peerId) ? body.peerId : crypto.randomUUID()
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 32) || 'Espectador' : 'Espectador'
    const expiresAt = new Date(Date.now() + 86400000)
    let session = (await db.select().from(roomSessions).where(eq(roomSessions.roomId, ROOM_ID)).limit(1))[0]
    if (!session) {
      const token = randomBytes(24).toString('hex')
      session = (await db.insert(roomSessions).values({ roomId: ROOM_ID, hostTokenHash: hash(token), expiresAt }).returning())[0]
    } else {
      session = (await db.update(roomSessions).set({ expiresAt, updatedAt: new Date() }).where(eq(roomSessions.roomId, ROOM_ID)).returning())[0]
    }
    await db.insert(roomPeers).values({ peerId, roomId: ROOM_ID, role, displayName }).onConflictDoUpdate({ target: roomPeers.peerId, set: { role, status: 'active', displayName, lastSeenAt: new Date() } })
    return roomJson(request, { roomId: ROOM_ID, peerId, role, isLive: session.status === 'live' })
  } catch (error) {
    console.error('[v0] Room session registration failed', error)
    return roomJson(request, { error: 'Não foi possível entrar na sala' }, { status: 503 })
  }
}

export async function GET(request: Request) {
  try {
    const now = new Date()
    const activeSince = new Date(now.getTime() - 7000)
    const session = (await db.select().from(roomSessions).where(and(eq(roomSessions.roomId, ROOM_ID), gt(roomSessions.expiresAt, now))).limit(1))[0]
    const peers = await db.select({ peerId: roomPeers.peerId, role: roomPeers.role, status: roomPeers.status, displayName: roomPeers.displayName }).from(roomPeers).where(and(eq(roomPeers.roomId, ROOM_ID), gt(roomPeers.lastSeenAt, activeSince), inArray(roomPeers.status, ['active', 'live']))).orderBy(desc(roomPeers.lastSeenAt))
    const host = peers.find((peer) => peer.role === 'host' && peer.status === 'live') || peers.find((peer) => peer.role === 'host') || null
    return roomJson(request, { roomId: ROOM_ID, isLive: session?.status === 'live' && host?.status === 'live', host, peers: peers.filter((p) => p.role === 'viewer') })
  } catch (error) {
    console.error('[room] Session lookup failed', error)
    return roomJson(request, { error: 'Não foi possível consultar a sala' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
