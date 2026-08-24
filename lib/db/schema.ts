import { bigint, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const roomSessions = pgTable('room_sessions', {
  roomId: text('room_id').primaryKey(),
  hostTokenHash: text('host_token_hash').notNull(),
  status: text('status').notNull().default('idle'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const roomPeers = pgTable(
  'room_peers',
  {
    peerId: text('peer_id').primaryKey(),
    roomId: text('room_id').notNull(),
    role: text('role').notNull(),
    displayName: text('display_name').notNull().default('Espectador'),
    status: text('status').notNull().default('active'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('room_peers_activity_idx').on(table.roomId, table.status, table.lastSeenAt),
    index('room_peers_last_seen_idx').on(table.lastSeenAt),
  ],
)

export const roomSignals = pgTable(
  'room_signals',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    roomId: text('room_id').notNull(),
    fromPeerId: text('from_peer_id').notNull(),
    toPeerId: text('to_peer_id').notNull(),
    signalType: text('signal_type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('room_signals_polling_idx').on(table.roomId, table.toPeerId, table.id)],
)

export const roomChannels = pgTable('room_channels', {
  roomId: text('room_id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull().default('Mesa Principal'),
  category: text('category').notNull().default('Transmissões'),
  description: text('description').notNull().default('Canal principal da comunidade'),
  avatar: text('avatar'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const streamProfiles = pgTable('stream_profiles', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  displayName: text('display_name').notNull(),
  referralCode: text('referral_code').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const schema = { roomSessions, roomPeers, roomSignals, roomChannels, streamProfiles }
