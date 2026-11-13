// ISO-8601 weeks, computed in UTC from the local calendar date so a check-in
// belongs to one week regardless of timezone offsets.
const DAY = 86400000;

function utcDay(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday of the week containing `date`, as YYYY-MM-DD. */
export function weekStart(date) {
  const t = utcDay(date);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * DAY).toISOString().slice(0, 10);
}

/** ISO week key such as 2026-W46. */
export function weekKey(date) {
  const t = utcDay(date);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  const thursday = t - dow * DAY + 3 * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday - jan1) / DAY / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function addWeeks(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n * 7);
  return d;
}

export function isoDate(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
