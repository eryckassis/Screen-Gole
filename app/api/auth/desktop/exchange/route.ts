import { and, eq, gt, isNull } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { appUsers, desktopAuthCodes, desktopSessions, roomMemberships } from '@/lib/db/schema'
import { desktopSessionExpiry, hashSecret } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body.code !== 'string' || typeof body.state !== 'string') return roomJson(request, { error: 'Código e estado são obrigatórios' }, { status: 400 })
    const now = new Date()
    const token = randomBytes(32).toString('base64url')
    const result = await db.transaction(async (tx) => {
      const code = (await tx.select().from(desktopAuthCodes).where(and(eq(desktopAuthCodes.codeHash, hashSecret(body.code)), eq(desktopAuthCodes.stateHash, hashSecret(body.state)), isNull(desktopAuthCodes.consumedAt), gt(desktopAuthCodes.expiresAt, now))).limit(1).for('update'))[0]
      if (!code) return null
      await tx.update(desktopAuthCodes).set({ consumedAt: now }).where(eq(desktopAuthCodes.id, code.id))
      await tx.insert(desktopSessions).values({ tokenHash: hashSecret(token), userId: code.userId, expiresAt: desktopSessionExpiry(), lastSeenAt: now })
      const user = (await tx.select().from(appUsers).where(eq(appUsers.id, code.userId)).limit(1))[0]
      const memberships = await tx.select({ roomId: roomMemberships.roomId, role: roomMemberships.role }).from(roomMemberships).where(eq(roomMemberships.userId, code.userId))
      return { user, memberships }
    })
    if (!result) return roomJson(request, { error: 'Código inválido, expirado ou já utilizado' }, { status: 401 })
    return roomJson(request, { token, ...result })
  } catch (error) {
    console.error('[auth] Desktop code exchange failed', error)
    return roomJson(request, { error: 'Não foi possível concluir o login no aplicativo' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
