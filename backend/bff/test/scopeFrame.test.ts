import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { scopeFrame } from '../src/routes/vms.js';

function fakeRequest(user: { role: 'admin' | 'viewer'; connectionIds: string[] }): FastifyRequest {
  return { user } as unknown as FastifyRequest;
}

describe('scopeFrame', () => {
  it('leaves non-connection frames untouched regardless of role', () => {
    const startFrame = { type: 'start' as const, connectionIds: ['a', 'b'] };
    expect(scopeFrame(startFrame, fakeRequest({ role: 'viewer', connectionIds: [] }))).toBe(startFrame);

    const doneFrame = { type: 'done' as const, refreshedAt: '2026-01-01T00:00:00.000Z' };
    expect(scopeFrame(doneFrame, fakeRequest({ role: 'admin', connectionIds: [] }))).toBe(doneFrame);
  });

  it('shows an admin every VM in a connection frame, with connectionId stripped', () => {
    const frame = {
      type: 'connection' as const,
      provider: 'aws' as const,
      connectionId: 'conn-1',
      vms: [{ id: 'vm-1', connectionId: 'conn-1' }] as never[],
    };
    const scoped = scopeFrame(frame, fakeRequest({ role: 'admin', connectionIds: [] }));
    expect(scoped).toEqual({ ...frame, vms: [{ id: 'vm-1' }] });
  });

  it('shows a viewer VMs for a connection they are assigned to, with connectionId stripped', () => {
    const frame = {
      type: 'connection' as const,
      provider: 'aws' as const,
      connectionId: 'conn-1',
      vms: [{ id: 'vm-1', connectionId: 'conn-1' }] as never[],
    };
    const scoped = scopeFrame(frame, fakeRequest({ role: 'viewer', connectionIds: ['conn-1', 'conn-2'] }));
    expect(scoped).toEqual({ ...frame, vms: [{ id: 'vm-1' }] });
  });

  it('hides VMs from a viewer not assigned to that connection', () => {
    const frame = {
      type: 'connection' as const,
      provider: 'aws' as const,
      connectionId: 'conn-1',
      vms: [{ id: 'vm-1', connectionId: 'conn-1' }] as never[],
    };
    const scoped = scopeFrame(frame, fakeRequest({ role: 'viewer', connectionIds: ['conn-2'] }));
    expect(scoped).toEqual({ ...frame, vms: [] });
  });
});
