import type { VmStreamFrame } from '@cirrus/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAggregatorVms } from '../src/clients/aggregatorClient.js';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamAggregatorVms', () => {
  it('parses NDJSON frames split arbitrarily across chunks, including a trailing line with no final newline', async () => {
    const frames: VmStreamFrame[] = [
      { type: 'start', connectionIds: ['conn-1'] },
      { type: 'connection', provider: 'aws', connectionId: 'conn-1', vms: [] },
      { type: 'done', refreshedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const fullBody = frames.map((f) => `${JSON.stringify(f)}\n`).join('');
    // Split mid-line to prove line-buffering across chunk boundaries works,
    // and drop the final frame's trailing newline to exercise the
    // end-of-stream flush of a partial last line.
    const splitPoint = Math.floor(fullBody.length / 2);
    const withoutTrailingNewline = fullBody.replace(/\n$/, '');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(streamOf([withoutTrailingNewline.slice(0, splitPoint), withoutTrailingNewline.slice(splitPoint)]), { status: 200 })),
    );

    const received: VmStreamFrame[] = [];
    await streamAggregatorVms('/vms', (frame) => received.push(frame));

    expect(received).toEqual(frames);
  });

  it('throws when the aggregator responds with a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })));

    await expect(streamAggregatorVms('/vms', () => {})).rejects.toThrow('502');
  });
});
