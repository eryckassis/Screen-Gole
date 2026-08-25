import { roomJson, roomOptions } from '@/lib/api/room-cors'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const state = typeof body.state === 'string' ? body.state : ''
  if (!/^[a-zA-Z0-9_-]{32,180}$/.test(state)) return roomJson(request, { error: 'Estado de autenticação inválido' }, { status: 400 })
  const origin = new URL(request.url).origin
  return roomJson(request, { authUrl: `${origin}/auth/desktop?state=${encodeURIComponent(state)}` })
}

export const OPTIONS = roomOptions
