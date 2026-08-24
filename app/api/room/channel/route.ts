import { and, eq, gt, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roomChannels, roomPeers } from '@/lib/db/schema'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

const ROOM_ID = 'main'
const DEFAULT_CHANNEL = {
  roomId: ROOM_ID,
  slug: 'main',
  name: 'Mesa Principal',
  category: 'Transmissões',
  description: 'Canal principal da comunidade',
  avatar: null,
}

async function getChannel() {
  const channel = (await db.select().from(roomChannels).where(eq(roomChannels.roomId, ROOM_ID)).limit(1))[0]
  if (channel) return channel
  return (await db.insert(roomChannels).values(DEFAULT_CHANNEL).onConflictDoNothing().returning())[0]
    || (await db.select().from(roomChannels).where(eq(roomChannels.roomId, ROOM_ID)).limit(1))[0]
}

export async function GET(request: Request) {
  try {
    return roomJson(request, { channel: await getChannel() })
  } catch (error) {
    console.error('[room] Channel lookup failed', error)
    return roomJson(request, { error: 'Não foi possível carregar o canal' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body.peerId !== 'string') return roomJson(request, { error: 'Host não identificado' }, { status: 401 })

    const activeHost = (await db.select({ peerId: roomPeers.peerId }).from(roomPeers).where(and(
      eq(roomPeers.peerId, body.peerId),
      eq(roomPeers.roomId, ROOM_ID),
      eq(roomPeers.role, 'host'),
      inArray(roomPeers.status, ['active', 'live']),
      gt(roomPeers.lastSeenAt, new Date(Date.now() - 15000)),
    )).limit(1))[0]
    if (!activeHost) return roomJson(request, { error: 'Somente o host ativo pode editar o canal' }, { status: 403 })

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : ''
    const category = typeof body.category === 'string' ? body.category.trim().slice(0, 32) : ''
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 100) : ''
    const avatar = body.avatar === null ? null : typeof body.avatar === 'string' ? body.avatar : undefined
    if (name.length < 2 || category.length < 2) return roomJson(request, { error: 'Nome e categoria precisam ter pelo menos 2 caracteres' }, { status: 400 })
    if (avatar !== undefined && avatar !== null && (!/^data:image\/(png|jpeg|webp);base64,/.test(avatar) || avatar.length > 1_000_000)) {
      return roomJson(request, { error: 'A imagem precisa ser PNG, JPEG ou WebP e ter até 700 KB' }, { status: 413 })
    }

    await getChannel()
    const channel = (await db.update(roomChannels).set({
      name,
      category,
      description,
      ...(avatar !== undefined ? { avatar } : {}),
      updatedAt: new Date(),
    }).where(eq(roomChannels.roomId, ROOM_ID)).returning())[0]
    return roomJson(request, { channel })
  } catch (error) {
    console.error('[room] Channel update failed', error)
    return roomJson(request, { error: 'Não foi possível salvar o canal' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
