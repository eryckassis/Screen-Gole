import { NextResponse } from 'next/server'

const ALLOWED_ORIGINS = new Set([
  'https://screen-gole.vercel.app',
  'http://tauri.localhost',
  'http://localhost:1420',
])

function corsHeaders(request: Request) {
  const headers = new Headers()
  const origin = request.headers.get('origin')

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type')
    headers.set('Access-Control-Max-Age', '86400')
    headers.set('Vary', 'Origin')
  }

  return headers
}

export function roomJson<T>(request: Request, body: T, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  corsHeaders(request).forEach((value, key) => response.headers.set(key, value))
  return response
}

export function roomOptions(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'Origem não permitida' }, { status: 403 })
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}
