import { AsyncLocalStorage } from 'node:async_hooks';

// Populated once per request (server.ts's onRequest hook) with that
// request's id — lets any outbound call made during this request's handling
// (clients/*.ts) attach the same X-Request-Id without threading it through
// every function signature.
export const requestIdStorage = new AsyncLocalStorage<string>();
