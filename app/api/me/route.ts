import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appUsers, roomMemberships } from '@/lib/db/schema'
import { accessErrorResponse, requireIdentity } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request)
    const memberships = await db.select({ roomId: roomMemberships.roomId, role: roomMemberships.role }).from(roomMemberships).where(eq(roomMemberships.userId, identity.user.id))
    return roomJson(request, { user: identity.user, memberships })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[auth] Profile lookup failed', error)
    return roomJson(request, { error: 'Não foi possível carregar seu perfil' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireIdentity(request)
    const body = await request.json().catch(() => ({}))
    const displayName = typeof body.displayName === 'string'
      ? body.displayName.trim().replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 24)
      : ''
    if (displayName.length < 2) return roomJson(request, { error: 'Use um nome com pelo menos 2 caracteres' }, { status: 400 })
    const normalizedName = displayName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
    const displayTag = `${displayName}#${String(identity.user.tagNumber).padStart(4, '0')}`
    const requestedAvatar = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : undefined
    const validAvatar = requestedAvatar === undefined || requestedAvatar === '' || (
      requestedAvatar.length <= 950_000 && (
        /^data:image\/(png|jpeg|webp);base64,/i.test(requestedAvatar) ||
        /^https:\/\//i.test(requestedAvatar)
      )
    )
    if (!validAvatar) return roomJson(request, { error: 'Use uma imagem PNG, JPEG ou WebP de até 700 KB' }, { status: 400 })
    try {
      const user = (await db.update(appUsers).set({
        displayName,
        normalizedName,
        displayTag,
        ...(requestedAvatar !== undefined ? { avatarUrl: requestedAvatar || null } : {}),
        updatedAt: new Date(),
      }).where(eq(appUsers.id, identity.user.id)).returning())[0]
      return roomJson(request, { user })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        return roomJson(request, { error: 'Esta combinação de nome e número já está em uso' }, { status: 409 })
      }
      throw error
    }
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[auth] Profile update failed', error)
    return roomJson(request, { error: 'Não foi possível atualizar seu perfil' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
