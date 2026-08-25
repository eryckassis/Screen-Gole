import { neonAuth } from '@/lib/auth/neon'

export default neonAuth.middleware({ loginUrl: '/login' })

export const config = {
  matcher: ['/', '/s/:path*', '/invite/:path*', '/auth/complete', '/auth/desktop'],
}
