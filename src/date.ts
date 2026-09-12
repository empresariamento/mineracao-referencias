/** Today's ISO date (YYYY-MM-DD, UTC) — the run key for a daily mining run. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
