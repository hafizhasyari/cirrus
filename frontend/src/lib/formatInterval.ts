// Formats a duration in seconds as a human-friendly "every N unit(s)"
// fragment, picking the coarsest unit that divides evenly — e.g. 21600 ->
// "6 hours", 60 -> "1 minute", 90 -> "90 seconds".
export function formatIntervalHuman(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (seconds % 3600 === 0) return plural(seconds / 3600, 'hour');
  if (seconds % 60 === 0) return plural(seconds / 60, 'minute');
  return plural(seconds, 'second');
}
