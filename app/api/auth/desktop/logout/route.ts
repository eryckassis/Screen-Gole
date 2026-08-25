import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { desktopSessions } from '@/lib/db/schema'
import { accessErrorResponse, requireIdentity } from '@/lib/auth/identity'
import { roomJson, roomOptions } from '@/lib/api/room-cors'

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request)
    if (identity.source !== 'desktop' || !identity.desktopSessionId) return roomJson(request, { error: 'Sessão de dispositivo necessária' }, { status: 400 })
    await db.update(desktopSessions).set({ revokedAt: new Date() }).where(eq(desktopSessions.id, identity.desktopSessionId))
    return roomJson(request, { ok: true })
  } catch (error) {
    const access = accessErrorResponse(error)
    if (access) return roomJson(request, { error: access.message }, { status: access.status })
    console.error('[auth] Desktop logout failed', error)
    return roomJson(request, { error: 'Não foi possível sair' }, { status: 503 })
  }
}

export const OPTIONS = roomOptions
