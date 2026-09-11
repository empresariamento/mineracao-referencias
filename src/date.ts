/** ISO date (YYYY-MM-DD, UTC) of the Monday of the week containing `now`. */
export function mondayOfCurrentWeekIso(now: Date = new Date()): string {
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMonday);
  return monday.toISOString().slice(0, 10);
}
