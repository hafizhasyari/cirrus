const DAY_MS = 24 * 60 * 60 * 1000;

// UTC offset (ms) of `timeZone` at instant `now`: formats `now` in that zone,
// reinterprets those same wall-clock components as if they were UTC, and
// diffs against `now` — the standard Intl-only trick for "what's this zone's
// offset right now", with no date-library dependency. Naturally handles
// DST-observing zones too, since it's recomputed per call rather than cached.
function offsetMsAt(now: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUTC - now;
}

// ms from `now` until the next midnight-aligned boundary in `timeZone` for a
// period of `intervalMs` — e.g. intervalMs=6h gives 00:00/06:00/12:00/18:00
// local; intervalMs=1h gives every hour on the hour. Always computed fresh
// from `now` (never accumulated across calls), so it self-corrects after a
// slow pass, a restart, or a changed interval/timezone instead of drifting.
// If intervalMs doesn't evenly divide a day, later-day boundaries drift from
// exact midnight — accepted, since the goal is "anchored to midnight", not a
// guaranteed-exact daily reset.
export function msUntilNextAlignedTick(intervalMs: number, timeZone: string, now: number = Date.now()): number {
  const zonedNow = now + offsetMsAt(now, timeZone);
  const zonedStartOfDay = Math.floor(zonedNow / DAY_MS) * DAY_MS;
  const elapsed = zonedNow - zonedStartOfDay;
  const ticksElapsed = Math.ceil(elapsed / intervalMs);
  const zonedNextTick = zonedStartOfDay + ticksElapsed * intervalMs;
  return zonedNextTick - zonedNow;
}
