import { createHash, randomInt } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  appUsers,
  desktopSessions,
  roomChannels,
  roomMemberships,
} from '@/lib/db/schema'
import { authIsConfigured, neonAuth } from './neon'

const MAIN_ROOM_ID = 'main'
const DEVICE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

type NeonSessionUser = {
  id: string
  email: string
  emailVerified?: boolean
  name?: string | null
  image?: string | null
}

export type AppIdentity = {
  user: typeof appUsers.$inferSelect
  source: 'web' | 'desktop'
  desktopSessionId?: string
}

export type RoomAccess = AppIdentity & {
  roomId: string
  role: 'owner' | 'member'
}

export class AccessError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    message: string,
  ) {
    super(message)
  }
}

export const hashSecret = (value: string) =>
  createHash('sha256').update(value).digest('hex')

function normalizeName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLocaleLowerCase('pt-BR')
    .slice(0, 24) || 'usuario'
}

function publicName(value: string | null | undefined) {
  const first = value?.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}_-]/gu, '')
  return first?.slice(0, 24) || 'Usuário'
}

async function ensureAppUser(authUser: NeonSessionUser) {
  const existing = (await db.select().from(appUsers).where(eq(appUsers.id, authUser.id)).limit(1))[0]
  if (existing) {
    const avatarUrl = existing.avatarUrl || authUser.image || null
    const email = authUser.email.toLocaleLowerCase('pt-BR')
    if (existing.email !== email || existing.avatarUrl !== avatarUrl) {
      return (await db.update(appUsers).set({ email, avatarUrl, updatedAt: new Date() }).where(eq(appUsers.id, authUser.id)).returning())[0]
    }
    return existing
  }

  const displayName = publicName(authUser.name)
  const normalizedName = normalizeName(displayName)
  return db.transaction(async (tx) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const tagNumber = randomInt(0, 10000)
      const displayTag = `${displayName}#${String(tagNumber).padStart(4, '0')}`
      const inserted = await tx
        .insert(appUsers)
        .values({
          id: authUser.id,
          email: authUser.email.toLocaleLowerCase('pt-BR'),
          displayName,
          normalizedName,
          tagNumber,
          displayTag,
          avatarUrl: authUser.image || null,
        })
        .onConflictDoNothing()
        .returning()
      if (inserted[0]) return inserted[0]

      const raced = (await tx.select().from(appUsers).where(eq(appUsers.id, authUser.id)).limit(1))[0]
      if (raced) return raced
    }
    throw new Error('Não foi possível gerar uma tag disponível')
  })
}

async function ensureInitialOwner(user: typeof appUsers.$inferSelect) {
  const ownerEmail = process.env.INITIAL_ROOM_OWNER_EMAIL?.trim().toLocaleLowerCase('pt-BR')
  if (!ownerEmail || user.email !== ownerEmail) return

  await db.transaction(async (tx) => {
    await tx.insert(roomChannels).values({ roomId: MAIN_ROOM_ID, slug: 'main', ownerUserId: user.id }).onConflictDoNothing()
    await tx
      .update(roomChannels)
      .set({ ownerUserId: user.id, updatedAt: new Date() })
      .where(and(eq(roomChannels.roomId, MAIN_ROOM_ID), isNull(roomChannels.ownerUserId)))
    const channel = (await tx.select({ ownerUserId: roomChannels.ownerUserId }).from(roomChannels).where(eq(roomChannels.roomId, MAIN_ROOM_ID)).limit(1))[0]
    if (channel?.ownerUserId !== user.id) return
    await tx
      .insert(roomMemberships)
      .values({ userId: user.id, roomId: MAIN_ROOM_ID, role: 'owner' })
      .onConflictDoUpdate({
        target: [roomMemberships.userId, roomMemberships.roomId],
        set: { role: 'owner' },
      })
  })
}

async function resolveDesktopIdentity(token: string): Promise<AppIdentity | null> {
  const now = new Date()
  const row = (await db
    .select({ session: desktopSessions, user: appUsers })
    .from(desktopSessions)
    .innerJoin(appUsers, eq(appUsers.id, desktopSessions.userId))
    .where(and(eq(desktopSessions.tokenHash, hashSecret(token)), isNull(desktopSessions.revokedAt), gt(desktopSessions.expiresAt, now)))
    .limit(1))[0]
  if (!row) return null

  if (now.getTime() - row.session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db.update(desktopSessions).set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + DEVICE_SESSION_TTL_MS) }).where(eq(desktopSessions.id, row.session.id))
  }
  await ensureInitialOwner(row.user)
  return { user: row.user, source: 'desktop', desktopSessionId: row.session.id }
}

async function resolveWebIdentity(): Promise<AppIdentity | null> {
  if (!authIsConfigured()) return null
  const result = await neonAuth.getSession()
  const session = result.data as { user?: NeonSessionUser } | null
  if (!session?.user?.id || !session.user.email || session.user.emailVerified === false) return null
  const user = await ensureAppUser(session.user)
  await ensureInitialOwner(user)
  return { user, source: 'web' }
}

export async function resolveIdentity(request?: Request): Promise<AppIdentity | null> {
  const authorization = request?.headers.get('authorization')
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice(7).trim()
    return token ? resolveDesktopIdentity(token) : null
  }
  return resolveWebIdentity()
}

export async function requireIdentity(request?: Request) {
  const identity = await resolveIdentity(request)
  if (!identity) throw new AccessError(401, 'Faça login para continuar')
  return identity
}

export async function requireRoomAccess(request: Request | undefined, roomId = MAIN_ROOM_ID, ownerOnly = false): Promise<RoomAccess> {
  const identity = await requireIdentity(request)
  const membership = (await db
    .select({ role: roomMemberships.role })
    .from(roomMemberships)
    .where(and(eq(roomMemberships.userId, identity.user.id), eq(roomMemberships.roomId, roomId)))
    .limit(1))[0]
  if (!membership) throw new AccessError(403, 'Você não tem acesso a esta sala')
  if (ownerOnly && membership.role !== 'owner') throw new AccessError(403, 'Somente o proprietário pode realizar esta ação')
  return { ...identity, roomId, role: membership.role === 'owner' ? 'owner' : 'member' }
}

export function accessErrorResponse(error: unknown) {
  if (error instanceof AccessError) return { status: error.status, message: error.message }
  return null
}

export const desktopSessionExpiry = () => new Date(Date.now() + DEVICE_SESSION_TTL_MS)
