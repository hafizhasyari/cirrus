import { db } from '../db/client.js';
import { auditLog } from '../db/schema.js';

export interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(entry: AuditEntry) {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
}
