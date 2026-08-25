import { neonAuth } from '@/lib/auth/neon'

export const dynamic = 'force-dynamic'
export const { GET, POST, PUT, DELETE, PATCH } = neonAuth.handler()
