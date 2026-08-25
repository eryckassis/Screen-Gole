import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomInvites, roomMemberships } from '@/lib/db/schema'
import { accessErrorResponse, hashSecret, requireIdentity } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

type Context = { params: Promise<{ token: string }> }

export async function POST(request: Request, { params }: Context) {
  try {
    const identity = await requireIdentity(request)
    const { token } = await params
    const invite = (await db.select().from(roomInvites).where(and(eq(roomInvites.tokenHash, hashSecret(token)), isNull(roomInvites.revokedAt), gt(roomInvites.expiresAt, new Date()))).limit(1))[0]
    if (!invite) return roomJson(request, { error: 'Este convite expirou ou foi revogado' }, { status: 410 })
    await db.insert(roomMemberships).values({ userId: identity.user.id, roomId: invite.roomId, role: 'member', invitedBy: invite.createdBy }).onConflictDoNothing()
    return roomJson(request, { ok: true, roomId: invite.roomId })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[rooms] Invite acceptance failed', error)
    return roomJson(request, { error: 'Não foi possível aceitar o convite' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
