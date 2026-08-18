import type { FastifyInstance } from 'fastify';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { cloudConnections, userCloudAccounts, users } from '../db/schema.js';
import { toUserDto } from '../lib/userDto.js';
import { writeAudit } from '../lib/audit.js';
import { sendInviteEmail } from '../lib/resendClient.js';

const inviteSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'viewer']),
  accountConnectionIds: z.array(z.string().uuid()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'viewer']).optional(),
  accountConnectionIds: z.array(z.string().uuid()).optional(),
});

async function assignedConnectionsFor(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, (typeof cloudConnections.$inferSelect)[]>();
  const rows = await db
    .select({ userId: userCloudAccounts.userId, conn: cloudConnections })
    .from(userCloudAccounts)
    .innerJoin(cloudConnections, eq(userCloudAccounts.connectionId, cloudConnections.id))
    .where(inArray(userCloudAccounts.userId, userIds));
  const map = new Map<string, (typeof cloudConnections.$inferSelect)[]>();
  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push(row.conn);
    map.set(row.userId, list);
  }
  return map;
}

async function setAssignedConnections(userId: string, connectionIds: string[]) {
  await db.delete(userCloudAccounts).where(eq(userCloudAccounts.userId, userId));
  if (connectionIds.length > 0) {
    await db.insert(userCloudAccounts).values(connectionIds.map((connectionId) => ({ userId, connectionId })));
  }
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get('/users', async () => {
    const rows = await db.select().from(users);
    const assigned = await assignedConnectionsFor(rows.map((r) => r.id));
    return rows.map((row) => toUserDto(row, assigned.get(row.id) ?? []));
  });

  app.post('/users', async (req, reply) => {
    const body = inviteSchema.parse(req.body);
    const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${body.email})`);
    if (existing) {
      reply.code(409);
      return { error: { code: 'CONFLICT', message: 'a user with this email already exists' } };
    }

    const [created] = await db
      .insert(users)
      .values({ name: body.name, email: body.email, role: body.role, status: 'pending' })
      .returning();
    if (!created) throw new Error('insert returned no row');

    if (body.accountConnectionIds?.length) {
      await setAssignedConnections(created.id, body.accountConnectionIds);
    }

    const actorUserId = (req.headers['x-actor-user-id'] as string) ?? null;
    await writeAudit({ actorUserId, action: 'user_invite', targetType: 'user', targetId: created.id, metadata: { email: body.email, role: body.role } });

    try {
      await sendInviteEmail({ to: created.email, name: created.name, role: created.role });
    } catch (err) {
      req.log.warn({ err, userId: created.id, email: created.email }, 'failed to send invite email');
    }

    const assigned = await assignedConnectionsFor([created.id]);
    reply.code(201);
    return toUserDto(created, assigned.get(created.id) ?? []);
  });

  app.patch<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    const body = updateSchema.parse(req.body);
    const { name, email, role, accountConnectionIds } = body;

    const [updated] = await db
      .update(users)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(role !== undefined ? { role } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.params.id))
      .returning();

    if (!updated) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'user not found' } };
    }

    if (accountConnectionIds !== undefined) {
      await setAssignedConnections(updated.id, accountConnectionIds);
    }

    const actorUserId = (req.headers['x-actor-user-id'] as string) ?? null;
    await writeAudit({ actorUserId, action: 'user_update', targetType: 'user', targetId: updated.id, metadata: body });

    const assigned = await assignedConnectionsFor([updated.id]);
    return toUserDto(updated, assigned.get(updated.id) ?? []);
  });

  app.delete<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    const [deleted] = await db.delete(users).where(eq(users.id, req.params.id)).returning();
    if (!deleted) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'user not found' } };
    }
    const actorUserId = (req.headers['x-actor-user-id'] as string) ?? null;
    await writeAudit({ actorUserId, action: 'user_remove', targetType: 'user', targetId: deleted.id, metadata: { email: deleted.email } });
    reply.code(204);
  });
}
