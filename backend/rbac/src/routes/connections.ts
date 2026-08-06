import type { FastifyInstance } from 'fastify';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Connection } from '@cirrus/shared-types';
import { db } from '../db/client.js';
import { cloudConnections, users } from '../db/schema.js';
import { writeAudit } from '../lib/audit.js';
import { FAILURE_MSG } from '../data/providers.js';

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

const testSchema = z.object({
  simulate: z.enum(['success', 'failure']).optional(),
});

type ConnectionRow = typeof cloudConnections.$inferSelect;

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

    const [created] = await db
      .insert(cloudConnections)
      .values({
        provider: body.provider,
        account: body.account,
        identifier: body.identifier,
        config: body.config ?? {},
        status: 'pending',
        addedByUserId: actorUserId,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');

    await writeAudit({ actorUserId, action: 'connection_create', targetType: 'connection', targetId: created.id, metadata: { provider: body.provider, account: body.account } });

    reply.code(201);
    return (await withAddedByNames([created]))[0];
  });

  app.patch<{ Params: { id: string } }>('/connections/:id', async (req, reply) => {
    const body = updateSchema.parse(req.body);
    const [updated] = await db
      .update(cloudConnections)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(cloudConnections.id, req.params.id))
      .returning();

    if (!updated) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'connection not found' } };
    }

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
    const actorUserId = (req.headers['x-actor-user-id'] as string) ?? null;
    await writeAudit({ actorUserId, action: 'connection_delete', targetType: 'connection', targetId: deleted.id, metadata: { provider: deleted.provider, account: deleted.account } });
    reply.code(204);
  });

  // Stubbed validation per PRD §7.3 — real per-provider SDK calls are deferred;
  // this simulates success/failure (matching the wizard's demo `simulate` toggle)
  // and persists the resulting status + message, exactly as the real flow will.
  app.post<{ Params: { id: string } }>('/connections/:id/test', async (req, reply) => {
    const body = testSchema.parse(req.body ?? {});
    const [conn] = await db.select().from(cloudConnections).where(eq(cloudConnections.id, req.params.id));
    if (!conn) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'connection not found' } };
    }

    const success = body.simulate !== 'failure';
    const message = success ? 'ok' : FAILURE_MSG[conn.provider];

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
    await writeAudit({ actorUserId, action: 'connection_test', targetType: 'connection', targetId: conn.id, metadata: { result: success ? 'success' : 'failure' } });

    return success ? { result: 'success' as const } : { result: 'failure' as const, message };
  });
}
