import { and, eq, ilike, ne, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appUsers, roomMemberships } from '@/lib/db/schema'
import { accessErrorResponse, requireRoomAccess } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

type Context = { params: Promise<{ roomId: string }> }

export async function GET(request: Request, { params }: Context) {
  const { roomId } = await params
  try {
    await requireRoomAccess(request, roomId, true)
    const members = await db
      .select({
        userId: appUsers.id,
        displayName: appUsers.displayName,
        displayTag: appUsers.displayTag,
        avatarUrl: appUsers.avatarUrl,
        role: roomMemberships.role,
        joinedAt: roomMemberships.joinedAt,
      })
      .from(roomMemberships)
      .innerJoin(appUsers, eq(appUsers.id, roomMemberships.userId))
      .where(eq(roomMemberships.roomId, roomId))

    const query = new URL(request.url).searchParams.get('q')?.trim() || ''
    let suggestions: Array<{
      userId: string
      displayName: string
      displayTag: string
      avatarUrl: string | null
    }> = []

    if (query.length >= 2) {
      const normalizedQuery = query
        .split('#')[0]
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLocaleLowerCase('pt-BR')
      const matches = await db
        .select({
          userId: appUsers.id,
          displayName: appUsers.displayName,
          displayTag: appUsers.displayTag,
          avatarUrl: appUsers.avatarUrl,
        })
        .from(appUsers)
        .where(
          or(
            normalizedQuery ? ilike(appUsers.normalizedName, `%${normalizedQuery}%`) : undefined,
            ilike(appUsers.displayTag, `%${query}%`),
          ),
        )
        .limit(20)
      const memberIds = new Set(members.map((member) => member.userId))
      suggestions = matches.filter((match) => !memberIds.has(match.userId)).slice(0, 8)
    }

    return roomJson(request, { members, suggestions })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[rooms] Member lookup failed', error)
    return roomJson(request, { error: 'Não foi possível listar os membros' }, { status: 503 })
  }
}

export async function POST(request: Request, { params }: Context) {
  const { roomId } = await params
  try {
    const owner = await requireRoomAccess(request, roomId, true)
    const body = await request.json().catch(() => ({}))
    const displayTag = typeof body.displayTag === 'string' ? body.displayTag.trim() : ''
    const parsedTag = /^(.{2,24})#(\d{4})$/u.exec(displayTag)
    if (!parsedTag) return roomJson(request, { error: 'Use a tag no formato Nome#1234' }, { status: 400 })
    const normalizedName = parsedTag[1].normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLocaleLowerCase('pt-BR')
    const member = (await db.select().from(appUsers).where(and(eq(appUsers.normalizedName, normalizedName), eq(appUsers.tagNumber, Number(parsedTag[2])))).limit(1))[0]
    if (!member) return roomJson(request, { error: 'Nenhum usuário encontrado com esta tag' }, { status: 404 })
    await db.insert(roomMemberships).values({ userId: member.id, roomId, role: 'member', invitedBy: owner.user.id }).onConflictDoNothing()
    return roomJson(request, { member: { userId: member.id, displayName: member.displayName, displayTag: member.displayTag, avatarUrl: member.avatarUrl, role: 'member' } }, { status: 201 })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[rooms] Member creation failed', error)
    return roomJson(request, { error: 'Não foi possível adicionar o membro' }, { status: 503 })
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const { roomId } = await params
  try {
    await requireRoomAccess(request, roomId, true)
    const body = await request.json().catch(() => ({}))
    if (typeof body.userId !== 'string') return roomJson(request, { error: 'Membro não identificado' }, { status: 400 })
    const removed = await db.delete(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, body.userId), ne(roomMemberships.role, 'owner'))).returning({ userId: roomMemberships.userId })
    if (!removed[0]) return roomJson(request, { error: 'Membro não encontrado ou proprietário protegido' }, { status: 404 })
    return roomJson(request, { ok: true })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[rooms] Member removal failed', error)
    return roomJson(request, { error: 'Não foi possível remover o membro' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
