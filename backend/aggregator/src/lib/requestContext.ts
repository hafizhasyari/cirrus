import { AsyncLocalStorage } from 'node:async_hooks';

// Populated once per request (server.ts's onRequest hook) with that
// request's id — lets fetchFromCollector (cache/lock.ts), called several
// layers deep via fanout.ts, attach the same X-Request-Id without threading
// it through every function signature.
export const requestIdStorage = new AsyncLocalStorage<string>();
