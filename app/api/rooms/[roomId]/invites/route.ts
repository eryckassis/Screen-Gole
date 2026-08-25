import { and, desc, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { roomInvites } from '@/lib/db/schema'
import { accessErrorResponse, hashSecret, requireRoomAccess } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

type Context = { params: Promise<{ roomId: string }> }

export async function GET(request: Request, { params }: Context) {
  const { roomId } = await params
  try {
    await requireRoomAccess(request, roomId, true)
    const invites = await db.select({ id: roomInvites.id, expiresAt: roomInvites.expiresAt, revokedAt: roomInvites.revokedAt, createdAt: roomInvites.createdAt }).from(roomInvites).where(eq(roomInvites.roomId, roomId)).orderBy(desc(roomInvites.createdAt))
    return roomJson(request, { invites })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[rooms] Invite lookup failed', error)
    return roomJson(request, { error: 'Não foi possível listar os convites' }, { status: 503 })
  }
}

export async function POST(request: Request, { params }: Context) {
  const { roomId } = await params
  try {
    const owner = await requireRoomAccess(request, roomId, true)
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const invite = (await db.insert(roomInvites).values({ tokenHash: hashSecret(token), roomId, createdBy: owner.user.id, expiresAt }).returning({ id: roomInvites.id, expiresAt: roomInvites.expiresAt }))[0]
    const origin = new URL(request.url).origin
    return roomJson(request, { invite: { ...invite, url: `${origin}/invite/${token}` } }, { status: 201 })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[rooms] Invite creation failed', error)
    return roomJson(request, { error: 'Não foi possível criar o convite' }, { status: 503 })
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const { roomId } = await params
  try {
    await requireRoomAccess(request, roomId, true)
    const body = await request.json().catch(() => ({}))
    if (typeof body.inviteId !== 'string') return roomJson(request, { error: 'Convite não identificado' }, { status: 400 })
    const invite = await db.update(roomInvites).set({ revokedAt: new Date() }).where(and(eq(roomInvites.id, body.inviteId), eq(roomInvites.roomId, roomId))).returning({ id: roomInvites.id })
    if (!invite[0]) return roomJson(request, { error: 'Convite não encontrado' }, { status: 404 })
    return roomJson(request, { ok: true })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[rooms] Invite revocation failed', error)
    return roomJson(request, { error: 'Não foi possível revogar o convite' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
