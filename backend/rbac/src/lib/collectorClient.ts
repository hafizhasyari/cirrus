import type { ProviderId } from '@cirrus/shared-types';
import { COLLECTOR_URLS } from '../env.js';

// Plain fetch against a collector's lightweight GET /test — no client
// library, matching this codebase's existing pattern for all inter-service
// calls (see lib/vault.ts). Mirrors the Aggregator's own collector-calling
// shape (cache/lock.ts's fetchFromCollector: AbortController + timeout).
const TEST_COLLECTOR_TIMEOUT_MS = 15_000;

export interface CollectorTestOutcome {
  ok: boolean;
  code?: 'AUTH_FAILED' | 'UPSTREAM_ERROR' | 'TIMEOUT';
  message: string;
}

interface TestResultBody {
  message?: string;
}

interface ErrorResponseBody {
  error?: { code?: string; message?: string };
}

/**
 * Calls a provider's collector `/test` endpoint for a real, provider-specific
 * validation of one connection's credentials — PRD §7.3's "cheapest
 * authenticated call" per provider, not the full inventory fetch.
 */
export async function testConnectionViaCollector(provider: ProviderId, connectionId: string): Promise<CollectorTestOutcome> {
  const baseUrl = COLLECTOR_URLS[provider];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_COLLECTOR_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/test?connectionId=${encodeURIComponent(connectionId)}`, {
      signal: controller.signal,
    });

    if (res.ok) {
      const body = (await res.json()) as TestResultBody;
      return { ok: true, message: body.message ?? 'ok' };
    }

    const body = (await res.json().catch(() => null)) as ErrorResponseBody | null;
    const code = body?.error?.code;
    return {
      ok: false,
      code: code === 'AUTH_FAILED' || code === 'UPSTREAM_ERROR' || code === 'TIMEOUT' ? code : 'UPSTREAM_ERROR',
      message: body?.error?.message ?? `collector ${provider} responded ${res.status}`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, code: 'TIMEOUT', message: 'validation request to the collector timed out' };
    }
    return { ok: false, code: 'UPSTREAM_ERROR', message: `unable to reach the ${provider} collector service: ${String(err)}` };
  } finally {
    clearTimeout(timeout);
  }
}
