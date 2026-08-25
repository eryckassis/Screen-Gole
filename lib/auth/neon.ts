import { createNeonAuth } from '@neondatabase/auth/next/server'

const fallbackSecret = 'screen-gole-build-only-secret-000000000000'

export const neonAuth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL || 'https://auth.invalid.local',
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET || fallbackSecret,
    sessionDataTtl: 300,
  },
})

export function authIsConfigured() {
  return Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET)
}
