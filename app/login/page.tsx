import { redirect } from 'next/navigation'
import { resolveIdentity } from '@/lib/auth/identity'
import { LoginClient } from './login-client'

export const dynamic = 'force-dynamic'

function safeDestination(value: string | undefined) {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeDestination((await searchParams).next)
  if (await resolveIdentity()) redirect(next)
  return <LoginClient next={next} />
}
