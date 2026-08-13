import { AsyncLocalStorage } from 'node:async_hooks';

// Populated once per request (server.ts's onRequest hook) with that
// request's id — lets an outbound call made several layers deep during this
// request's handling (collectorClient.ts, vault.ts) attach the same
// X-Request-Id without threading it through every function signature.
// The health-check scheduler (scheduler.ts) has no live inbound request to
// inherit an id from, so it mints its own via requestIdStorage.run() once
// per connection-check instead — .run() scopes that id to just its own
// callback, so concurrent checks in the same batch don't share one id.
export const requestIdStorage = new AsyncLocalStorage<string>();
