import { describe, expect, it } from 'vitest';
import { msUntilNextAlignedTick } from '../src/lib/scheduleAlignment.js';

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

describe('msUntilNextAlignedTick', () => {
  it('aligns a 6h interval to the next WIB quarter-day boundary (00:00/06:00/12:00/18:00)', () => {
    // 2026-01-15T04:00:00+07:00 (WIB) == 2025-12-14T21:00:00Z... use an
    // explicit WIB instant instead: 2026-01-15 09:30 WIB == 2026-01-15T02:30:00Z
    const now = Date.parse('2026-01-15T02:30:00Z'); // 09:30 WIB
    const delay = msUntilNextAlignedTick(6 * HOUR, 'Asia/Jakarta', now);
    // Next boundary is 12:00 WIB == 05:00:00Z same day
    expect(now + delay).toBe(Date.parse('2026-01-15T05:00:00Z'));
  });

  it('matches the clarified example: changing to a 1h interval at 11:46 WIB starts the next pass at 12:00 WIB', () => {
    const now = Date.parse('2026-01-15T04:46:00Z'); // 11:46 WIB
    const delay = msUntilNextAlignedTick(HOUR, 'Asia/Jakarta', now);
    expect(delay).toBe(14 * MIN);
    expect(now + delay).toBe(Date.parse('2026-01-15T05:00:00Z')); // 12:00 WIB
  });

  it('fires immediately when now is exactly on a boundary', () => {
    const now = Date.parse('2026-01-15T05:00:00Z'); // exactly 12:00 WIB
    const delay = msUntilNextAlignedTick(6 * HOUR, 'Asia/Jakarta', now);
    expect(delay).toBe(0);
  });

  it('accepts drift for an interval that does not evenly divide a day', () => {
    // now = 2026-01-15T00:00:00Z = 07:00 WIB, i.e. 7h (25,200,000ms) past the
    // previous WIB midnight (2026-01-14T17:00:00Z). A 5000s (5,000,000ms)
    // interval doesn't divide 25,200,000 evenly: ceil(25.2M / 5M) = 6, so the
    // next boundary is 6*5,000,000 = 30,000,000ms (8h20m) past that midnight
    // — 08:20 WIB, not a round hour, confirming later-day drift is accepted.
    const now = Date.parse('2026-01-15T00:00:00Z');
    const delay = msUntilNextAlignedTick(5000 * 1000, 'Asia/Jakarta', now);
    expect(now + delay).toBe(Date.parse('2026-01-15T01:20:00Z')); // 08:20 WIB
  });

  it('computes a genuine dynamic offset for a DST-observing zone (America/New_York)', () => {
    // 2026-07-01 is EDT (UTC-4) in New York — mid-summer, unambiguous.
    const now = Date.parse('2026-07-01T13:30:00Z'); // 09:30 EDT
    const delay = msUntilNextAlignedTick(6 * HOUR, 'America/New_York', now);
    // Next 6h-aligned boundary from local midnight is 12:00 EDT == 16:00:00Z
    expect(now + delay).toBe(Date.parse('2026-07-01T16:00:00Z'));
  });
});
