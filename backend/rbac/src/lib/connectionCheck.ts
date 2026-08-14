import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cloudConnections } from '../db/schema.js';
import { writeAudit } from './audit.js';
import { testConnectionViaCollector, type CollectorTestOutcome } from './collectorClient.js';
import { FAILURE_MSG } from '../data/providers.js';
import { connectionCheckTotal } from './metrics.js';

export type ConnectionRow = typeof cloudConnections.$inferSelect;

export interface RunConnectionCheckOptions {
  /** The clicking user for a manual /test call; null for the scheduler. */
  actorUserId?: string | null;
  /** Distinguishes an automated pass from a human-initiated click in the audit trail. */
  source: 'manual' | 'scheduled';
  /** Set only when testing currently-typed-but-unsaved values (see lib/testOverrides.ts); never set by the scheduler. */
  testToken?: string;
}

export interface RunConnectionCheckResult {
  success: boolean;
  message: string;
  code?: CollectorTestOutcome['code'];
}

// Single source of truth for "run one connection's test against its
// collector, persist status/lastCheckedAt/lastCheckMessage, and write the
// audit entry." Used by both the manual POST /connections/:id/test route
// and the periodic scheduler (scheduler.ts) so the two paths can't drift apart.
export async function runConnectionCheck(
  conn: ConnectionRow,
  opts: RunConnectionCheckOptions,
): Promise<RunConnectionCheckResult> {
  const outcome = await testConnectionViaCollector(conn.provider, conn.id, opts.testToken);
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

  await writeAudit({
    actorUserId: opts.actorUserId ?? null,
    action: 'connection_test',
    targetType: 'connection',
    targetId: conn.id,
    metadata: success
      ? { result: 'success', source: opts.source }
      : { result: 'failure', code: outcome.code, source: opts.source },
  });

  connectionCheckTotal.inc({
    provider: conn.provider,
    source: opts.source,
    result: success ? 'success' : 'failure',
  });

  return { success, message, code: outcome.code };
}
