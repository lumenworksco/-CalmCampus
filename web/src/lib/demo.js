import { addWeeks, isoDate, weekKey } from "./week.js";

// Fake history for reviewers. Deterministic, covers every level, and is only
// ever written to the separate demo key, never mixed with real answers.
// "Yes" counts for the six weeks before the current one, oldest first.
const PATTERN = [0, 1, 1, 2, 3, 2];

export function demoEntries(config, today = new Date()) {
  return PATTERN.map((yes, i) => {
    const date = addWeeks(today, i - PATTERN.length);
    const answers = {};
    const qv = {};
    config.questions.forEach((q, j) => { answers[q.id] = j < yes; qv[q.id] = q.version; });
    return { week: weekKey(date), date: isoDate(date), answers, qv, demo: true };
  });
}
