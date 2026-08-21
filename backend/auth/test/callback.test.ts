import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/oidc/msalClient.js', () => ({
  msalClient: {
    acquireTokenByCode: vi.fn(),
    getAuthCodeUrl: vi.fn(async () => 'https://login.microsoftonline.com/fake-authorize-url'),
  },
  cryptoProvider: {
    generatePkceCodes: vi.fn(async () => ({ verifier: 'fake-verifier', challenge: 'fake-challenge' })),
    createNewGuid: vi.fn(() => 'fake-state-nonce'),
  },
  SCOPES: ['openid', 'profile'],
}));

const { msalClient } = await import('../src/oidc/msalClient.js');
const { buildApp } = await import('../src/server.js');

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.mocked(msalClient.acquireTokenByCode).mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

/** Drives a real /login request to get a validly-signed `auth_flow` cookie —
 * simpler and more realistic than hand-rolling fastify-cookie's signing. */
async function getFlowCookie(): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/login' });
  const flowCookie = res.cookies.find((c) => c.name === 'auth_flow');
  if (!flowCookie) throw new Error('expected /login to set an auth_flow cookie');
  return flowCookie.value;
}

describe('GET /callback', () => {
  it('exchanges the code, upserts via RBAC, and redirects with a session cookie on success', async () => {
    const flowCookie = await getFlowCookie();
    vi.mocked(msalClient.acquireTokenByCode).mockResolvedValue({
      idTokenClaims: { oid: 'user-oid-1', tid: 'tenant-1', name: 'Test User', preferred_username: 'test@example.com' },
      // biome-ignore lint: minimal fake token response, only idTokenClaims is read
    } as never);
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));

    const res = await app.inject({
      method: 'GET',
      url: '/callback?code=fake-code&state=fake-state-nonce',
      cookies: { auth_flow: flowCookie },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/');
    expect(res.cookies.some((c) => c.name === 'cirrus_session')).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://rbac.test.invalid/internal/upsert-on-login',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('redirects with authError=INVALID_FLOW when there is no auth_flow cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/callback?code=fake-code&state=fake-state-nonce' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/?authError=INVALID_FLOW');
  });

  it('redirects with authError=NOT_INVITED when RBAC reports the user was never invited', async () => {
    const flowCookie = await getFlowCookie();
    vi.mocked(msalClient.acquireTokenByCode).mockResolvedValue({
      idTokenClaims: { oid: 'user-oid-2', tid: 'tenant-1', name: 'Uninvited User', preferred_username: 'uninvited@example.com' },
    } as never);
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 404 }));

    const res = await app.inject({
      method: 'GET',
      url: '/callback?code=fake-code&state=fake-state-nonce',
      cookies: { auth_flow: flowCookie },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/?authError=NOT_INVITED');
  });
});
