import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomPeers, roomSessions } from '@/lib/db/schema'
import { accessErrorResponse, requireRoomAccess } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

const ROOM_ID = 'main'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export async function POST(request: Request) {
  try {
    const access = await requireRoomAccess(request, ROOM_ID)
    const body = await request.json().catch(() => ({}))
    const peerId = typeof body.peerId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(body.peerId) ? body.peerId : crypto.randomUUID()
    const role = access.role === 'owner' ? 'host' : 'viewer'
    const existingPeer = (await db.select({ userId: roomPeers.userId }).from(roomPeers).where(eq(roomPeers.peerId, peerId)).limit(1))[0]
    if (existingPeer?.userId && existingPeer.userId !== access.user.id) return roomJson(request, { error: 'Este peerId já pertence a outra sessão' }, { status: 403 })
    const expiresAt = new Date(Date.now() + 86400000)
    let session = (await db.select().from(roomSessions).where(eq(roomSessions.roomId, ROOM_ID)).limit(1))[0]
    if (!session) {
      session = (await db.insert(roomSessions).values({ roomId: ROOM_ID, hostTokenHash: hash(randomBytes(24).toString('hex')), expiresAt }).returning())[0]
    } else {
      session = (await db.update(roomSessions).set({ expiresAt, updatedAt: new Date() }).where(eq(roomSessions.roomId, ROOM_ID)).returning())[0]
    }
    await db.insert(roomPeers).values({ peerId, userId: access.user.id, roomId: ROOM_ID, role, displayName: access.user.displayName }).onConflictDoUpdate({ target: roomPeers.peerId, set: { role, status: 'active', displayName: access.user.displayName, lastSeenAt: new Date() } })
    return roomJson(request, { roomId: ROOM_ID, peerId, role, isLive: session.status === 'live' })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[room] Session registration failed', error)
    return roomJson(request, { error: 'Não foi possível entrar na sala' }, { status: 503 })
  }
}

export async function GET(request: Request) {
  try {
    await requireRoomAccess(request, ROOM_ID)
    const now = new Date()
    const activeSince = new Date(now.getTime() - 7000)
    const session = (await db.select().from(roomSessions).where(and(eq(roomSessions.roomId, ROOM_ID), gt(roomSessions.expiresAt, now))).limit(1))[0]
    const peers = await db.select({ peerId: roomPeers.peerId, role: roomPeers.role, status: roomPeers.status, displayName: roomPeers.displayName }).from(roomPeers).where(and(eq(roomPeers.roomId, ROOM_ID), gt(roomPeers.lastSeenAt, activeSince), inArray(roomPeers.status, ['active', 'live']))).orderBy(desc(roomPeers.lastSeenAt))
    const host = peers.find((peer) => peer.role === 'host' && peer.status === 'live') || peers.find((peer) => peer.role === 'host') || null
    return roomJson(request, { roomId: ROOM_ID, isLive: session?.status === 'live' && host?.status === 'live', host, peers: peers.filter((peer) => peer.role === 'viewer') })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[room] Session lookup failed', error)
    return roomJson(request, { error: 'Não foi possível consultar a sala' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
