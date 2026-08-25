import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomChannels, roomMemberships, roomSessions } from '@/lib/db/schema'
import { accessErrorResponse, requireIdentity } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request)
    const rows = await db
      .select({
        roomId: roomChannels.roomId,
        slug: roomChannels.slug,
        name: roomChannels.name,
        category: roomChannels.category,
        description: roomChannels.description,
        avatar: roomChannels.avatar,
        role: roomMemberships.role,
        sessionStatus: roomSessions.status,
        sessionExpiresAt: roomSessions.expiresAt,
      })
      .from(roomMemberships)
      .innerJoin(roomChannels, eq(roomChannels.roomId, roomMemberships.roomId))
      .leftJoin(roomSessions, eq(roomSessions.roomId, roomChannels.roomId))
      .where(eq(roomMemberships.userId, identity.user.id))

    const now = Date.now()
    const rooms = rows.map(({ sessionStatus, sessionExpiresAt, ...room }) => ({
      ...room,
      isLive:
        sessionStatus === 'live' &&
        Boolean(sessionExpiresAt && sessionExpiresAt.getTime() > now),
    }))

    return roomJson(request, { rooms })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[rooms] Room directory lookup failed', error)
    return roomJson(request, { error: 'Não foi possível consultar suas salas' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
