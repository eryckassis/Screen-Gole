import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { RoomApp } from '@/components/room-app'
import { RoomAccessLobby } from '@/components/room-access-lobby'
import { db } from '@/lib/db'
import { roomMemberships } from '@/lib/db/schema'
import { resolveIdentity } from '@/lib/auth/identity'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const identity = await resolveIdentity()
  if (!identity) redirect('/login?next=/')
  const membership = (await db.select({ role: roomMemberships.role }).from(roomMemberships).where(and(eq(roomMemberships.userId, identity.user.id), eq(roomMemberships.roomId, 'main'))).limit(1))[0]
  if (!membership) return <RoomAccessLobby displayTag={identity.user.displayTag} />
  return <RoomApp initialMode={membership.role === 'owner' ? 'host' : 'viewer'} initialProfile={{ name: identity.user.displayName, avatar: identity.user.avatarUrl || '' }} initialTag={identity.user.displayTag} />
}
