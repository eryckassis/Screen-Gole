import { NextResponse } from 'next/server'

export function POST() {
  return NextResponse.json(
    { error: 'Endpoint substituído por /api/me; entre com o Google para continuar' },
    { status: 410 },
  )
}
