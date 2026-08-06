import type { ActiveConnection, CollectorInstance, Vm } from '@cirrus/shared-types';

// Aggregator-internal shape only — carries connectionId so the BFF can scope
// results to a Viewer's assigned accounts before stripping it and returning
// plain Vm[] to the frontend. Not part of the public/frontend contract.
export interface VmWithConnection extends Vm {
  connectionId: string;
}

// Collector wire format is intentionally raw/provider-shaped (instanceType,
// memoryGB, launchedAt ISO datetime); this maps it onto the frontend's Vm
// contract. 'terminated' is folded into 'stopped' here since the frontend's
// VmStatus type doesn't have a third state yet — widen it there, not here,
// when frontend wiring happens (PRD's own point is stopped-but-billed VMs
// should stay visible, not get dropped).
export function normalizeInstance(instance: CollectorInstance, conn: ActiveConnection): VmWithConnection {
  return {
    id: instance.id,
    name: instance.name,
    provider: conn.provider,
    account: conn.account,
    region: instance.region,
    status: instance.status === 'running' ? 'running' : 'stopped',
    type: instance.instanceType,
    cpu: instance.cpu,
    memory: instance.memoryGB,
    disks: instance.disks,
    privateIp: instance.privateIp,
    publicIp: instance.publicIp,
    launched: instance.launchedAt.slice(0, 10),
    connectionId: conn.connectionId,
  };
}
