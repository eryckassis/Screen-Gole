import { notFound } from 'next/navigation'
import { RoomApp } from '@/components/room-app'

export default async function PermanentRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug !== 'main') notFound()
  return <RoomApp initialMode="viewer" />
}
