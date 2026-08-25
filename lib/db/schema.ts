import { sql } from 'drizzle-orm'
import { bigint, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const appUsers = pgTable(
  'app_users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    tagNumber: integer('tag_number').notNull(),
    displayTag: text('display_tag').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('app_users_display_tag_unique').on(table.normalizedName, table.tagNumber)],
)

export const userFriendships = pgTable(
  'user_friendships',
  {
    userAId: text('user_a_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
    userBId: text('user_b_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
    requestedById: text('requested_by_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userAId, table.userBId] }),
    check('user_friendships_order_check', sql`${table.userAId} < ${table.userBId}`),
    check('user_friendships_requester_check', sql`${table.requestedById} = ${table.userAId} OR ${table.requestedById} = ${table.userBId}`),
    check('user_friendships_status_check', sql`${table.status} IN ('pending', 'accepted')`),
    index('user_friendships_user_b_status_idx').on(table.userBId, table.status),
    index('user_friendships_requester_idx').on(table.requestedById, table.status),
  ],
)

export const roomMemberships = pgTable(
  'room_memberships',
  {
    userId: text('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
    roomId: text('room_id').notNull(),
    role: text('role').notNull().default('member'),
    invitedBy: text('invited_by').references(() => appUsers.id, { onDelete: 'set null' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roomId] }),
    index('room_memberships_room_idx').on(table.roomId, table.role),
  ],
)

export const roomInvites = pgTable(
  'room_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    roomId: text('room_id').notNull(),
    createdBy: text('created_by').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('room_invites_active_idx').on(table.roomId, table.expiresAt, table.revokedAt)],
)

export const desktopAuthCodes = pgTable(
  'desktop_auth_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeHash: text('code_hash').notNull().unique(),
    stateHash: text('state_hash').notNull(),
    userId: text('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('desktop_auth_codes_expiry_idx').on(table.expiresAt)],
)

export const desktopSessions = pgTable(
  'desktop_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: text('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('desktop_sessions_active_idx').on(table.userId, table.expiresAt, table.revokedAt)],
)

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
    userId: text('user_id').references(() => appUsers.id, { onDelete: 'cascade' }),
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
  ownerUserId: text('owner_user_id').references(() => appUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const streamProfiles = pgTable('stream_profiles', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  displayName: text('display_name').notNull(),
  referralCode: text('referral_code').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const schema = {
  appUsers,
  userFriendships,
  roomMemberships,
  roomInvites,
  desktopAuthCodes,
  desktopSessions,
  roomSessions,
  roomPeers,
  roomSignals,
  roomChannels,
  streamProfiles,
}
