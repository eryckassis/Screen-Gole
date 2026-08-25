import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'
import { RoomApp } from '@/components/room-app'
import { db } from '@/lib/db'
import { roomMemberships } from '@/lib/db/schema'
import { resolveIdentity } from '@/lib/auth/identity'

export const dynamic = 'force-dynamic'

export default async function PermanentRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug !== 'main') notFound()
  const identity = await resolveIdentity()
  if (!identity) redirect(`/login?next=${encodeURIComponent(`/s/${slug}`)}`)
  const membership = (await db.select({ role: roomMemberships.role }).from(roomMemberships).where(and(eq(roomMemberships.userId, identity.user.id), eq(roomMemberships.roomId, slug))).limit(1))[0]
  if (!membership) redirect('/')
  return <RoomApp initialMode={membership.role === 'owner' ? 'host' : 'viewer'} initialProfile={{ name: identity.user.displayName, avatar: identity.user.avatarUrl || '' }} initialTag={identity.user.displayTag} />
}
