import type { FastifyRequest } from 'fastify';
import type { Connection } from '@cirrus/shared-types';
import { describe, expect, it } from 'vitest';
import { scopeConnections } from '../src/routes/connections.js';

function fakeRequest(user: { role: 'admin' | 'viewer'; connectionIds: string[] }): FastifyRequest {
  return { user } as unknown as FastifyRequest;
}

function fakeConnection(id: string): Connection {
  return {
    id,
    provider: 'aws',
    account: 'test@inmotion.co.id',
    identifier: 'AKIA...',
    status: 'active',
    lastChecked: '2026-01-01T00:00:00.000Z',
    addedBy: 'Administrator',
    config: {},
  };
}

describe('scopeConnections', () => {
  it('shows an admin every connection unfiltered', () => {
    const connections = [fakeConnection('a'), fakeConnection('b')];
    expect(scopeConnections(connections, fakeRequest({ role: 'admin', connectionIds: [] }))).toBe(connections);
  });

  it('shows a viewer only their own assigned connections', () => {
    const connections = [fakeConnection('a'), fakeConnection('b'), fakeConnection('c')];
    const scoped = scopeConnections(connections, fakeRequest({ role: 'viewer', connectionIds: ['b'] }));
    expect(scoped).toEqual([fakeConnection('b')]);
  });

  it('shows a viewer nothing when assigned to none of the connections', () => {
    const connections = [fakeConnection('a'), fakeConnection('b')];
    const scoped = scopeConnections(connections, fakeRequest({ role: 'viewer', connectionIds: ['z'] }));
    expect(scoped).toEqual([]);
  });
});
