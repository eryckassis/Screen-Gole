import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { streamProfiles } from '@/lib/db/schema'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 32) : ''
    if (displayName.length < 2) return NextResponse.json({ error: 'Nome inválido' }, { status: 400 })
    const [profile] = await db
      .insert(streamProfiles)
      .values({ displayName, referralCode: randomBytes(6).toString('hex') })
      .returning({ id: streamProfiles.id, displayName: streamProfiles.displayName, referralCode: streamProfiles.referralCode })
    return NextResponse.json(profile, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Não foi possível criar o perfil' }, { status: 500 })
  }
}
