import { and, asc, desc, eq, gt, ilike, inArray, ne, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  appUsers,
  roomChannels,
  roomMemberships,
  roomPeers,
  roomSessions,
  userFriendships,
} from '@/lib/db/schema'
import { accessErrorResponse, requireIdentity } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

function friendshipPair(currentUserId: string, targetUserId: string) {
  return currentUserId < targetUserId
    ? { userAId: currentUserId, userBId: targetUserId }
    : { userAId: targetUserId, userBId: currentUserId }
}

function normalizeSearch(value: string) {
  return value
    .split('#')[0]
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLocaleLowerCase('pt-BR')
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request)
    const currentUserId = identity.user.id
    const relationships = await db
      .select()
      .from(userFriendships)
      .where(or(eq(userFriendships.userAId, currentUserId), eq(userFriendships.userBId, currentUserId)))
      .orderBy(desc(userFriendships.updatedAt))

    const relatedIds = relationships.map((relationship) =>
      relationship.userAId === currentUserId ? relationship.userBId : relationship.userAId,
    )
    const relatedUsers = relatedIds.length
      ? await db
          .select({
            userId: appUsers.id,
            displayName: appUsers.displayName,
            displayTag: appUsers.displayTag,
            avatarUrl: appUsers.avatarUrl,
          })
          .from(appUsers)
          .where(inArray(appUsers.id, relatedIds))
      : []
    const userById = new Map(relatedUsers.map((user) => [user.userId, user]))

    const activeSince = new Date(Date.now() - 7000)
    const activePeers = relatedIds.length
      ? await db
          .select({ userId: roomPeers.userId, role: roomPeers.role, status: roomPeers.status })
          .from(roomPeers)
          .where(
            and(
              inArray(roomPeers.userId, relatedIds),
              gt(roomPeers.lastSeenAt, activeSince),
              inArray(roomPeers.status, ['active', 'live']),
            ),
          )
      : []
    const onlineIds = new Set(activePeers.flatMap((peer) => (peer.userId ? [peer.userId] : [])))
    const liveHostIds = new Set(
      activePeers.flatMap((peer) =>
        peer.userId && peer.role === 'host' && peer.status === 'live' ? [peer.userId] : [],
      ),
    )

    const acceptedIds = relationships
      .filter((relationship) => relationship.status === 'accepted')
      .map((relationship) =>
        relationship.userAId === currentUserId ? relationship.userBId : relationship.userAId,
      )
    const ownedRooms = acceptedIds.length
      ? await db
          .select({
            ownerUserId: roomChannels.ownerUserId,
            roomId: roomChannels.roomId,
            slug: roomChannels.slug,
            name: roomChannels.name,
            avatar: roomChannels.avatar,
            sessionStatus: roomSessions.status,
            sessionExpiresAt: roomSessions.expiresAt,
          })
          .from(roomChannels)
          .leftJoin(roomSessions, eq(roomSessions.roomId, roomChannels.roomId))
          .where(inArray(roomChannels.ownerUserId, acceptedIds))
      : []
    const roomsByOwner = new Map<string, Array<{ roomId: string; slug: string; name: string; avatar: string | null; isLive: boolean }>>()
    const now = Date.now()
    for (const room of ownedRooms) {
      if (!room.ownerUserId) continue
      const rooms = roomsByOwner.get(room.ownerUserId) || []
      rooms.push({
        roomId: room.roomId,
        slug: room.slug,
        name: room.name,
        avatar: room.avatar,
        isLive:
          liveHostIds.has(room.ownerUserId) &&
          room.sessionStatus === 'live' &&
          Boolean(room.sessionExpiresAt && room.sessionExpiresAt.getTime() > now),
      })
      roomsByOwner.set(room.ownerUserId, rooms)
    }

    const friends: Array<Record<string, unknown>> = []
    const incoming: Array<Record<string, unknown>> = []
    const outgoing: Array<Record<string, unknown>> = []
    for (const relationship of relationships) {
      const otherUserId = relationship.userAId === currentUserId ? relationship.userBId : relationship.userAId
      const user = userById.get(otherUserId)
      if (!user) continue
      const item = {
        ...user,
        online: onlineIds.has(otherUserId),
        rooms: roomsByOwner.get(otherUserId) || [],
        createdAt: relationship.createdAt.toISOString(),
      }
      if (relationship.status === 'accepted') friends.push(item)
      else if (relationship.requestedById === currentUserId) outgoing.push(item)
      else incoming.push(item)
    }

    const query = new URL(request.url).searchParams.get('q')?.trim() || ''
    let suggestions: Array<{
      userId: string
      displayName: string
      displayTag: string
      avatarUrl: string | null
      online: boolean
    }> = []
    if (query.length >= 2) {
      const normalizedQuery = normalizeSearch(query)
      const matches = await db
        .select({
          userId: appUsers.id,
          displayName: appUsers.displayName,
          displayTag: appUsers.displayTag,
          avatarUrl: appUsers.avatarUrl,
        })
        .from(appUsers)
        .where(
          and(
            ne(appUsers.id, currentUserId),
            or(
              normalizedQuery ? ilike(appUsers.normalizedName, `%${normalizedQuery}%`) : undefined,
              ilike(appUsers.displayTag, `%${query}%`),
            ),
          ),
        )
        .orderBy(asc(appUsers.displayName))
        .limit(24)
      const blockedIds = new Set(relatedIds)
      const availableMatches = matches.filter((match) => !blockedIds.has(match.userId)).slice(0, 10)
      const suggestionIds = availableMatches.map((match) => match.userId)
      const suggestionPeers = suggestionIds.length
        ? await db
            .select({ userId: roomPeers.userId })
            .from(roomPeers)
            .where(
              and(
                inArray(roomPeers.userId, suggestionIds),
                gt(roomPeers.lastSeenAt, activeSince),
                inArray(roomPeers.status, ['active', 'live']),
              ),
            )
        : []
      const suggestionOnlineIds = new Set(suggestionPeers.flatMap((peer) => (peer.userId ? [peer.userId] : [])))
      suggestions = availableMatches.map((match) => ({ ...match, online: suggestionOnlineIds.has(match.userId) }))
    }

    return roomJson(request, { friends, incoming, outgoing, suggestions })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[friends] Directory lookup failed', error)
    return roomJson(request, { error: 'Não foi possível atualizar seus amigos' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request)
    const body = await request.json().catch(() => ({}))
    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : ''
    if (!targetUserId || targetUserId === identity.user.id) {
      return roomJson(request, { error: 'Usuário inválido para amizade' }, { status: 400 })
    }
    const target = (await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.id, targetUserId)).limit(1))[0]
    if (!target) return roomJson(request, { error: 'Usuário não encontrado' }, { status: 404 })

    const pair = friendshipPair(identity.user.id, targetUserId)
    const created = await db
      .insert(userFriendships)
      .values({ ...pair, requestedById: identity.user.id })
      .onConflictDoNothing()
      .returning({ userAId: userFriendships.userAId })
    if (!created[0]) {
      return roomJson(request, { error: 'Já existe uma amizade ou pedido entre vocês' }, { status: 409 })
    }
    return roomJson(request, { ok: true }, { status: 201 })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[friends] Request creation failed', error)
    return roomJson(request, { error: 'Não foi possível enviar o pedido' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireIdentity(request)
    const body = await request.json().catch(() => ({}))
    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : ''
    const action = body.action === 'accept' || body.action === 'decline' ? body.action : ''
    if (!targetUserId || !action) return roomJson(request, { error: 'Pedido inválido' }, { status: 400 })
    const pair = friendshipPair(identity.user.id, targetUserId)

    const updated = await db.transaction(async (tx) => {
      const pending = (await tx
        .select()
        .from(userFriendships)
        .where(
          and(
            eq(userFriendships.userAId, pair.userAId),
            eq(userFriendships.userBId, pair.userBId),
            eq(userFriendships.status, 'pending'),
            ne(userFriendships.requestedById, identity.user.id),
          ),
        )
        .limit(1))[0]
      if (!pending) return false

      if (action === 'decline') {
        await tx.delete(userFriendships).where(and(eq(userFriendships.userAId, pair.userAId), eq(userFriendships.userBId, pair.userBId)))
        return true
      }

      await tx
        .update(userFriendships)
        .set({ status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(userFriendships.userAId, pair.userAId), eq(userFriendships.userBId, pair.userBId)))

      const ownedRooms = await tx
        .select({ roomId: roomChannels.roomId, ownerUserId: roomChannels.ownerUserId })
        .from(roomChannels)
        .where(inArray(roomChannels.ownerUserId, [identity.user.id, targetUserId]))
      const memberships = ownedRooms.flatMap((room) => {
        if (room.ownerUserId === identity.user.id) {
          return [{ userId: targetUserId, roomId: room.roomId, role: 'member', invitedBy: identity.user.id }]
        }
        if (room.ownerUserId === targetUserId) {
          return [{ userId: identity.user.id, roomId: room.roomId, role: 'member', invitedBy: targetUserId }]
        }
        return []
      })
      if (memberships.length) await tx.insert(roomMemberships).values(memberships).onConflictDoNothing()
      return true
    })

    if (!updated) return roomJson(request, { error: 'Pedido não encontrado ou já processado' }, { status: 404 })
    return roomJson(request, { ok: true })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[friends] Request update failed', error)
    return roomJson(request, { error: 'Não foi possível responder ao pedido' }, { status: 503 })
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requireIdentity(request)
    const body = await request.json().catch(() => ({}))
    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : ''
    if (!targetUserId || targetUserId === identity.user.id) return roomJson(request, { error: 'Amizade inválida' }, { status: 400 })
    const pair = friendshipPair(identity.user.id, targetUserId)
    const removed = await db
      .delete(userFriendships)
      .where(and(eq(userFriendships.userAId, pair.userAId), eq(userFriendships.userBId, pair.userBId)))
      .returning({ userAId: userFriendships.userAId })
    if (!removed[0]) return roomJson(request, { error: 'Amizade ou pedido não encontrado' }, { status: 404 })
    return roomJson(request, { ok: true })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[friends] Relationship removal failed', error)
    return roomJson(request, { error: 'Não foi possível remover a amizade' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
