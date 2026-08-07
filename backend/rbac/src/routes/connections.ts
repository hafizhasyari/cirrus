import type { FastifyInstance } from 'fastify';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Connection, ProviderId } from '@cirrus/shared-types';
import { db } from '../db/client.js';
import { cloudConnections, users } from '../db/schema.js';
import { writeAudit } from '../lib/audit.js';
import { deleteSecret, writeSecret } from '../lib/vault.js';
import { testConnectionViaCollector } from '../lib/collectorClient.js';
import { FAILURE_MSG, FIELD_DEFS } from '../data/providers.js';

const createSchema = z.object({
  provider: z.enum(['aws', 'gcp', 'alibaba', 'oci', 'biznet']),
  account: z.string().min(1),
  identifier: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z.object({
  account: z.string().min(1).optional(),
  identifier: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

type ConnectionRow = typeof cloudConnections.$inferSelect;

// Splits an incoming config payload by each field's FIELD_DEFS.secret flag —
// non-secret fields stay in Postgres (as always), secret fields (OCI's
// privateKey/passphrase, Biznet's xToken) are routed to Vault instead.
// For providers with no secret fields (AWS/GCP/Alibaba) `secret` is always
// empty, so behavior is byte-for-byte unchanged from before Vault existed.
function splitConfig(provider: ProviderId, config: Record<string, unknown>) {
  const secretKeys = new Set(FIELD_DEFS[provider].filter((f) => f.secret).map((f) => f.key));
  const nonSecret: Record<string, unknown> = {};
  const secret: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    (secretKeys.has(key) ? secret : nonSecret)[key] = value;
  }
  return { nonSecret, secret };
}

function toConnectionDto(row: ConnectionRow, addedByName: string): Connection {
  return {
    id: row.id,
    provider: row.provider,
    account: row.account,
    identifier: row.identifier,
    status: row.status,
    lastChecked: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : 'never',
    addedBy: addedByName,
  };
}

async function withAddedByNames(rows: ConnectionRow[]): Promise<Connection[]> {
  const userIds = [...new Set(rows.map((r) => r.addedByUserId).filter((id): id is string => !!id))];
  const userRows = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
  const nameById = new Map(userRows.map((u) => [u.id, u.name]));
  return rows.map((row) => toConnectionDto(row, (row.addedByUserId && nameById.get(row.addedByUserId)) || 'Unknown'));
}

export async function registerConnectionRoutes(app: FastifyInstance) {
  app.get('/connections', async () => {
    const rows = await db.select().from(cloudConnections);
    return withAddedByNames(rows);
  });

  app.post('/connections', async (req, reply) => {
    const body = createSchema.parse(req.body);
    const actorUserId = (req.headers['x-actor-user-id'] as string) ?? null;
    const { nonSecret, secret } = splitConfig(body.provider, body.config ?? {});

    const [created] = await db
      .insert(cloudConnections)
      .values({
        provider: body.provider,
        account: body.account,
        identifier: body.identifier,
        config: nonSecret,
        status: 'pending',
        addedByUserId: actorUserId,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');

    if (Object.keys(secret).length > 0) {
      const path = `cirrus/connections/${created.id}`;
      await writeSecret(path, secret);
      created.secretRef = path;
      await db.update(cloudConnections).set({ secretRef: path }).where(eq(cloudConnections.id, created.id));
    }

    await writeAudit({ actorUserId, action: 'connection_create', targetType: 'connection', targetId: created.id, metadata: { provider: body.provider, account: body.account } });

    reply.code(201);
    return (await withAddedByNames([created]))[0];
  });

  app.patch<{ Params: { id: string } }>('/connections/:id', async (req, reply) => {
    const body = updateSchema.parse(req.body);

    const [existing] = await db.select().from(cloudConnections).where(eq(cloudConnections.id, req.params.id));
    if (!existing) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'connection not found' } };
    }

    let nonSecretConfig: Record<string, unknown> | undefined;
    let secretRef = existing.secretRef;
    if (body.config !== undefined) {
      const split = splitConfig(existing.provider, body.config);
      nonSecretConfig = split.nonSecret;
      if (Object.keys(split.secret).length > 0) {
        secretRef = existing.secretRef ?? `cirrus/connections/${existing.id}`;
        await writeSecret(secretRef, split.secret);
      }
    }

    const [updated] = await db
      .update(cloudConnections)
      .set({
        ...(body.account !== undefined ? { account: body.account } : {}),
        ...(body.identifier !== undefined ? { identifier: body.identifier } : {}),
        ...(nonSecretConfig !== undefined ? { config: nonSecretConfig } : {}),
        secretRef,
        updatedAt: new Date(),
      })
      .where(eq(cloudConnections.id, req.params.id))
      .returning();
    if (!updated) throw new Error('update returned no row');

    const actorUserId = (req.headers['x-actor-user-id'] as string) ?? null;
    await writeAudit({ actorUserId, action: 'connection_update', targetType: 'connection', targetId: updated.id, metadata: body });

    return (await withAddedByNames([updated]))[0];
  });

  app.delete<{ Params: { id: string } }>('/connections/:id', async (req, reply) => {
    const [deleted] = await db.delete(cloudConnections).where(eq(cloudConnections.id, req.params.id)).returning();
    if (!deleted) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'connection not found' } };
    }
    if (deleted.secretRef) {
      await deleteSecret(deleted.secretRef);
    }
    const actorUserId = (req.headers['x-actor-user-id'] as string) ?? null;
    await writeAudit({ actorUserId, action: 'connection_delete', targetType: 'connection', targetId: deleted.id, metadata: { provider: deleted.provider, account: deleted.account } });
    reply.code(204);
  });

  // Real validation per PRD §7.3: calls the provider's own collector, which
  // performs the cheapest authenticated call for that provider — AWS
  // sts:AssumeRole + sts:GetCallerIdentity + ec2:DescribeRegions; GCP
  // iamcredentials.generateAccessToken + resourcemanager.testIamPermissions;
  // Alibaba sts:AssumeRole + sts:GetCallerIdentity; OCI config.validate_config
  // + identity.list_regions + compute.list_instances; Biznet
  // GET /neolites/accounts.
  app.post<{ Params: { id: string } }>('/connections/:id/test', async (req, reply) => {
    const [conn] = await db.select().from(cloudConnections).where(eq(cloudConnections.id, req.params.id));
    if (!conn) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'connection not found' } };
    }

    const outcome = await testConnectionViaCollector(conn.provider, conn.id);
    const success = outcome.ok;
    const message = outcome.message || FAILURE_MSG[conn.provider];

    await db
      .update(cloudConnections)
      .set({
        status: success ? 'active' : 'error',
        lastCheckedAt: new Date(),
        lastCheckMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(cloudConnections.id, conn.id));

    const actorUserId = (req.headers['x-actor-user-id'] as string) ?? null;
    await writeAudit({
      actorUserId,
      action: 'connection_test',
      targetType: 'connection',
      targetId: conn.id,
      metadata: success ? { result: 'success' } : { result: 'failure', code: outcome.code },
    });

    return success ? { result: 'success' as const } : { result: 'failure' as const, message };
  });
}
