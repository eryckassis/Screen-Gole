import { and, eq, gt, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { roomInvites, roomMemberships } from '@/lib/db/schema'
import { hashSecret, resolveIdentity } from '@/lib/auth/identity'

export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const identity = await resolveIdentity()
  if (!identity) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)
  const invite = (await db.select().from(roomInvites).where(and(eq(roomInvites.tokenHash, hashSecret(token)), isNull(roomInvites.revokedAt), gt(roomInvites.expiresAt, new Date()))).limit(1))[0]
  if (!invite) return <InviteError />
  await db.insert(roomMemberships).values({ userId: identity.user.id, roomId: invite.roomId, role: 'member', invitedBy: invite.createdBy }).onConflictDoNothing()
  redirect(`/s/${invite.roomId}`)
}

function InviteError() {
  return <main className="grid min-h-dvh place-items-center bg-black p-6 text-white"><section className="max-w-md rounded-3xl bg-[#1b1b1b] p-8 text-center"><h1 className="text-2xl font-bold">Convite indisponível</h1><p className="mt-3 leading-7 text-white/60">O link expirou, foi revogado ou não existe mais. Solicite um novo convite ao proprietário.</p></section></main>
}
