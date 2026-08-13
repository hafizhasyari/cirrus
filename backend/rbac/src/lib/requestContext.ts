import { AsyncLocalStorage } from 'node:async_hooks';

// Populated once per request (server.ts's onRequest hook) with that
// request's id — lets an outbound call made several layers deep during this
// request's handling (collectorClient.ts, vault.ts) attach the same
// X-Request-Id without threading it through every function signature.
// Empty (undefined) when there's no live request at all — e.g. the
// health-check scheduler's periodic runs (scheduler.ts), which is expected
// and handled gracefully by every reader of this store.
export const requestIdStorage = new AsyncLocalStorage<string>();
