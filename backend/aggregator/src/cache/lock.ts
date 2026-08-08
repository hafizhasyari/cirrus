import { randomUUID } from 'node:crypto';
import type { ActiveConnection, CollectorInstance, CollectorInstancesResponse } from '@cirrus/shared-types';
import { COLLECTOR_URLS } from '../env.js';
import { redis } from './redisClient.js';

// PRD §6.1: Redis caches fetch results with a short TTL (2-5 min soft freshness).
// SOFT_TTL_MS governs "is this still fresh enough to skip a refetch"; HARD_TTL_MS
// is the outer safety net a stale entry is served under while a refill is locked.
const SOFT_TTL_MS = 3 * 60 * 1000;
const HARD_TTL_MS = 15 * 60 * 1000;
// Real provider API calls (multi-region AssumeRole+DescribeInstances, WIF
// token exchange + impersonation) don't fit in the old 5s stub-era budget.
// LOCK_TTL_MS/COLD_START_MAX_WAIT_MS are raised alongside COLLECTOR_TIMEOUT_MS
// so the lock can't be stolen mid-fetch and cold-start waiters don't give up
// before a legitimately-slow-but-successful fetch finishes.
// Raised alongside the AWS collector's own 45s /instances deadline (a real
// multi-region account's full fetch legitimately needs more than the old
// 25s/30s budgets) — all three must stay >= COLLECTOR_TIMEOUT_MS so the lock
// can't be considered stale, and a cold-start waiter doesn't give up, mid a
// legitimately-slow-but-succeeding real fetch.
const LOCK_TTL_MS = 55_000;
const COLD_START_POLL_MS = 150;
const COLD_START_MAX_WAIT_MS = 55_000;
const COLLECTOR_TIMEOUT_MS = 50_000;

const UNLOCK_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export interface CacheEntry {
  instances: CollectorInstance[];
  fetchedAt: number;
  /** Set only when this entry is being served as a last-known-good fallback
   * after a live collector fetch just failed (the lock-winner's own fetch,
   * not the stampede-protection lock-loser path below, which never fails). */
  error?: { code: string; message: string };
}

/** Carries a collector's classified error code (TIMEOUT/AUTH_FAILED/UPSTREAM_ERROR) through Promise.allSettled. */
export class CollectorError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function cacheKey(conn: ActiveConnection) {
  return `inventory:${conn.provider}:${conn.connectionId}`;
}

function lockKey(conn: ActiveConnection) {
  return `lock:inventory:${conn.provider}:${conn.connectionId}`;
}

async function fetchFromCollector(conn: ActiveConnection): Promise<CollectorInstancesResponse> {
  const baseUrl = COLLECTOR_URLS[conn.provider];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COLLECTOR_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/instances?connectionId=${encodeURIComponent(conn.connectionId)}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      throw new CollectorError(
        body?.error?.code ?? 'UPSTREAM_ERROR',
        body?.error?.message ?? `collector ${conn.provider} responded ${res.status}`,
      );
    }
    return (await res.json()) as CollectorInstancesResponse;
  } catch (err) {
    if (err instanceof CollectorError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CollectorError('TIMEOUT', `collector ${conn.provider} did not respond in time`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForLockRelease(conn: ActiveConnection): Promise<CacheEntry> {
  const deadline = Date.now() + COLD_START_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, COLD_START_POLL_MS));
    const cached = await redis.get(cacheKey(conn));
    if (cached) return JSON.parse(cached) as CacheEntry;
    const stillLocked = await redis.get(lockKey(conn));
    if (!stillLocked) break;
  }
  throw new CollectorError('TIMEOUT', `timed out waiting for ${conn.provider}/${conn.connectionId} cache refill`);
}

/**
 * Cache-stampede-protected fetch for one (provider, connection). Mirrors PRD §6.1's
 * literal "SET NX PX" lock: only one caller re-fetches from the collector while
 * others get the last known-good data ("pakai data lama sebentar").
 */
export async function fetchInstancesCached(conn: ActiveConnection, forceRefresh: boolean): Promise<CacheEntry> {
  const cKey = cacheKey(conn);

  if (!forceRefresh) {
    const cached = await redis.get(cKey);
    if (cached) {
      const entry = JSON.parse(cached) as CacheEntry;
      if (Date.now() - entry.fetchedAt < SOFT_TTL_MS) return entry;
    }
  }

  const token = randomUUID();
  const gotLock = await redis.set(lockKey(conn), token, { NX: true, PX: LOCK_TTL_MS });

  if (gotLock === 'OK') {
    try {
      const fresh = await fetchFromCollector(conn);
      const entry: CacheEntry = { instances: fresh.instances, fetchedAt: Date.now() };
      await redis.set(cKey, JSON.stringify(entry), { PX: HARD_TTL_MS });
      return entry;
    } catch (err) {
      // The refetch failed — fall back to whatever's still cached rather than
      // dropping this connection's VMs outright (PRD §6.3 graceful
      // degradation; matches OutageBanner's "showing cached data" copy).
      // Left untouched in Redis (same fetchedAt/TTL) since this is a read,
      // not a refresh.
      const existing = await redis.get(cKey);
      if (existing) {
        const entry = JSON.parse(existing) as CacheEntry;
        const code = err instanceof CollectorError ? err.code : 'UPSTREAM_ERROR';
        const message = err instanceof Error ? err.message : String(err);
        return { ...entry, error: { code, message } };
      }
      throw err;
    } finally {
      await redis.eval(UNLOCK_SCRIPT, { keys: [lockKey(conn)], arguments: [token] });
    }
  }

  const stale = await redis.get(cKey);
  if (stale) return JSON.parse(stale) as CacheEntry;
  return waitForLockRelease(conn);
}
