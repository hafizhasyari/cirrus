import type { FastifyInstance } from 'fastify';
import { db } from './db/client.js';
import { cloudConnections } from './db/schema.js';
import { runConnectionCheck } from './lib/connectionCheck.js';
import { env } from './env.js';

// Bounds how many connections are checked concurrently in one pass — keeps
// per-collector load reasonable without serializing a large connection
// count through TEST_COLLECTOR_TIMEOUT_MS (15s) one at a time. Not exposed
// via env; tune here if it ever needs to change.
const CONCURRENCY_LIMIT = 5;

export interface SchedulerHandle {
  stop(): void;
}

// Runs one full pass: re-checks every stored connection (all providers, all
// statuses — including 'error'/'expired' so a recovered connection's
// status flips back automatically, not just active ones drifting to error).
export async function runHealthCheckPass(app: FastifyInstance): Promise<void> {
  const rows = await db.select().from(cloudConnections);
  app.log.info({ count: rows.length }, 'connection health-check pass starting');

  for (let i = 0; i < rows.length; i += CONCURRENCY_LIMIT) {
    const batch = rows.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.allSettled(
      batch.map((conn) => runConnectionCheck(conn, { actorUserId: null, source: 'scheduled' })),
    );
    results.forEach((r, idx) => {
      const conn = batch[idx];
      if (!conn) return;
      if (r.status === 'rejected') {
        // runConnectionCheck's own testConnectionViaCollector call already
        // catches collector-reachability errors internally (returns
        // ok:false rather than throwing); a rejection here means the DB
        // update/audit write itself failed. Log and move on — one bad
        // connection must never abort the pass or crash the process.
        app.log.error({ err: r.reason, connectionId: conn.id, provider: conn.provider }, 'scheduled connection check failed unexpectedly');
      } else {
        app.log.info({ connectionId: conn.id, provider: conn.provider, success: r.value.success }, 'scheduled connection check complete');
      }
    });
  }

  app.log.info('connection health-check pass complete');
}

// Single-instance assumption: there's exactly one rbac container in
// docker-compose.yml today, so there's no cross-instance thundering herd to
// stagger against. If rbac is ever scaled out horizontally, revisit this
// (e.g. a Postgres advisory lock) rather than letting every replica
// double-check every connection on the same schedule.
export function startHealthCheckScheduler(app: FastifyInstance): SchedulerHandle {
  const intervalMs = env.healthCheckIntervalMs;
  if (intervalMs <= 0) {
    app.log.info('connection health-check scheduler disabled (HEALTH_CHECK_INTERVAL_SECONDS <= 0)');
    return { stop() {} };
  }

  let running = false;
  const timer = setInterval(() => {
    if (running) {
      app.log.warn('skipping health-check tick: previous pass still in progress');
      return;
    }
    running = true;
    runHealthCheckPass(app)
      .catch((err) => app.log.error({ err }, 'connection health-check pass threw'))
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  app.log.info({ intervalMs }, 'connection health-check scheduler started');
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
