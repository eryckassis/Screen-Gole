import { redirect } from 'next/navigation'
import { resolveIdentity } from '@/lib/auth/identity'

export const dynamic = 'force-dynamic'

function safeDestination(value: string | undefined) {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export default async function AuthCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const destination = safeDestination((await searchParams).next)
  const identity = await resolveIdentity()

  if (!identity) {
    redirect(`/login?next=${encodeURIComponent(destination)}`)
  }

  redirect(destination)
}
