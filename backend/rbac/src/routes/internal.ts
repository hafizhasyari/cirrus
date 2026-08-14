import type { FastifyInstance } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActiveConnection, ConnectionConfigResponse } from '@cirrus/shared-types';
import { db } from '../db/client.js';
import { cloudConnections, userCloudAccounts, users } from '../db/schema.js';
import { toAuthenticatedUser } from '../lib/userDto.js';
import { writeAudit } from '../lib/audit.js';
import { readSecret } from '../lib/vault.js';
import { getTestOverride } from '../lib/testOverrides.js';
import { FIELD_DEFS } from '../data/providers.js';

// Must match frontend/src/lib/formValidation.ts's MASKED_PLACEHOLDER — the
// sentinel the edit-connection drawer prefills an untouched secret field
// with, so a test override for that field means "use the real stored
// secret," not a literal credential to test.
const MASKED_PLACEHOLDER = '••••••••••••••••••••';

const upsertOnLoginSchema = z.object({
  oid: z.string().min(1),
  tid: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
});

const auditSchema = z.object({
  actorUserId: z.string().uuid().optional().nullable(),
  action: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function assignedConnections(userId: string, role: 'admin' | 'viewer') {
  if (role === 'admin') return [];
  const rows = await db
    .select({ conn: cloudConnections })
    .from(userCloudAccounts)
    .innerJoin(cloudConnections, eq(userCloudAccounts.connectionId, cloudConnections.id))
    .where(eq(userCloudAccounts.userId, userId));
  return rows.map((r) => r.conn);
}

export async function registerInternalRoutes(app: FastifyInstance) {
  app.post('/internal/upsert-on-login', async (req, reply) => {
    const body = upsertOnLoginSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(users)
      .where(
        and(
          sql`lower(${users.email}) = lower(${body.email})`,
          sql`${users.status} != 'disabled'`,
        ),
      );

    if (!existing) {
      reply.code(404);
      return { error: { code: 'NOT_INVITED', message: 'no pending or active invitation for this email' } };
    }

    const [updated] = await db
      .update(users)
      .set({
        oid: body.oid,
        tid: body.tid,
        name: body.name && existing.name === '' ? body.name : existing.name,
        status: 'active',
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    if (!updated) throw new Error('update returned no row');

    await writeAudit({ actorUserId: updated.id, action: 'login', targetType: 'user', targetId: updated.id, metadata: {} });

    const accounts = await assignedConnections(updated.id, updated.role);
    return toAuthenticatedUser(updated, accounts);
  });

  app.get<{ Querystring: { oid: string; tid: string } }>('/internal/whoami', async (req, reply) => {
    const { oid, tid } = req.query;
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.oid, oid), eq(users.tid, tid), eq(users.status, 'active')));

    if (!user) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'no active user for this identity' } };
    }

    const accounts = await assignedConnections(user.id, user.role);
    return toAuthenticatedUser(user, accounts);
  });

  app.get<{ Querystring: { status?: string } }>('/internal/connections', async (req) => {
    const status = req.query.status ?? 'active';
    const rows = await db
      .select()
      .from(cloudConnections)
      .where(eq(cloudConnections.status, status as 'active' | 'pending' | 'error' | 'expired'));

    const result: ActiveConnection[] = rows.map((r) => ({ connectionId: r.id, provider: r.provider, account: r.account }));
    return result;
  });

  // Collectors' only path to a connection's provider-specific config
  // (accessKeyId/secretAccessKey, projectId/poolId/providerId/
  // saEmail, ...) — the collector resolves this itself, the Aggregator
  // never sees or forwards credential material.
  app.get<{ Params: { id: string }; Querystring: { testToken?: string } }>('/internal/connections/:id', async (req, reply) => {
    const [row] = await db.select().from(cloudConnections).where(eq(cloudConnections.id, req.params.id));
    if (!row) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'connection not found' } };
    }

    // Merge the Vault-backed secret fields (if any) back into config,
    // transparently — the collector never knows or cares whether a field
    // came from Postgres or Vault.
    let config = row.config as Record<string, unknown>;
    if (row.secretRef) {
      const secret = await readSecret(row.secretRef);
      if (secret) config = { ...config, ...secret };
    }

    // A manual /test call testing currently-typed-but-unsaved values (see
    // lib/testOverrides.ts) — token-scoped so no other caller (in
    // particular the scheduler's own periodic health-check pass, which
    // resolves config via this exact endpoint) can ever pick up an
    // override that wasn't meant for it, even for the same connectionId.
    const override = req.query.testToken ? getTestOverride(row.id) : null;
    if (override && override.token === req.query.testToken) {
      const secretKeys = new Set(FIELD_DEFS[row.provider].filter((f) => f.secret).map((f) => f.key));
      config = { ...config };
      for (const [key, value] of Object.entries(override.config)) {
        if (secretKeys.has(key) && value === MASKED_PLACEHOLDER) continue;
        config[key] = value;
      }
    }

    const result: ConnectionConfigResponse = {
      connectionId: row.id,
      provider: row.provider,
      account: row.account,
      identifier: row.identifier,
      status: row.status,
      config,
    };
    return result;
  });

  app.post('/internal/audit', async (req, reply) => {
    const body = auditSchema.parse(req.body);
    await writeAudit(body);
    reply.code(201);
    return { ok: true };
  });
}
