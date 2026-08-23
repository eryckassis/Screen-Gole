import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 32) : ''
    if (displayName.length < 2) return NextResponse.json({ error: 'Nome inválido' }, { status: 400 })
    const rows = await db.execute(sql`INSERT INTO stream_profiles (display_name, referral_code) VALUES (${displayName}, encode(gen_random_bytes(6), 'hex')) RETURNING id, display_name, referral_code`)
    return NextResponse.json(rows[0], { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Não foi possível criar o perfil' }, { status: 500 })
  }
}
