import { sql } from 'drizzle-orm';
import {
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'viewer']);
export const userStatusEnum = pgEnum('user_status', ['pending', 'active', 'disabled']);
export const providerIdEnum = pgEnum('provider_id', ['aws', 'gcp', 'alibaba', 'oci', 'biznet']);
export const connectionStatusEnum = pgEnum('connection_status', [
  'pending',
  'active',
  'error',
  'expired',
]);

// email uniqueness/lookup is done case-insensitively in application code
// (lower(email) comparisons) rather than via the citext extension, to avoid
// an extra Postgres extension dependency for a single indexed column.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  oid: text('oid'), // NULL until first Entra login
  tid: text('tid'),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  role: roleEnum('role').notNull().default('viewer'),
  status: userStatusEnum('status').notNull().default('pending'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_email_lower_idx').on(sql`lower(${table.email})`),
  uniqueIndex('users_oid_tid_not_null_idx')
    .on(table.oid, table.tid)
    .where(sql`${table.oid} IS NOT NULL`),
]);

export const cloudConnections = pgTable('cloud_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: providerIdEnum('provider').notNull(),
  account: text('account').notNull(),
  identifier: text('identifier').notNull(),
  config: jsonb('config').notNull().default({}),
  secretRef: text('secret_ref'), // path to this connection's Vault KV v2 secret (cirrus/connections/{id}); null when the provider has no secret fields (GCP/Alibaba)
  status: connectionStatusEnum('status').notNull().default('pending'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastCheckMessage: text('last_check_message'),
  addedByUserId: uuid('added_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userCloudAccounts = pgTable('user_cloud_accounts', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').notNull().references(() => cloudConnections.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.userId, table.connectionId] }),
]);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
