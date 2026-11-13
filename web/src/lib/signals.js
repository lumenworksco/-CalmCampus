// Simulated phone signals for demo mode only.
//
// The native CalmCampus app reads these on the phone (Apple Health and Screen Time
// on iPhone, Health Connect on Android) and compares each one with the student's
// own usual. A browser cannot read any of them, so this web demo uses three
// made-up example weeks, always labelled Demo data and never mixed with real answers.
//
// Signals only change which questions come first and what context is shown. They
// never answer a question and never change the result: the level comes from the
// student's own answers alone.

export const SIGNAL_IDS = ["sleep", "lateScreen", "steps"];

// "usual" is what the native app would take as the median of the previous weeks.
const USUAL = { sleep: 7.4, lateScreen: 15, steps: 8200 };

// One value per day, Monday to Sunday. Sleep in hours a night, late screen in
// minutes of phone use after midnight, steps a day.
export const SCENARIOS = {
  steady: {
    sleep: [7.5, 7.1, 7.6, 7.0, 7.4, 7.8, 6.9],
    lateScreen: [10, 20, 5, 15, 25, 10, 15],
    steps: [9100, 7600, 8800, 8000, 8300, 9400, 7900],
  },
  exams: {
    sleep: [6.8, 6.4, 6.0, 5.7, 6.2, 5.9, 6.1],
    lateScreen: [40, 55, 70, 45, 60, 65, 50],
    steps: [7400, 6800, 6200, 7100, 6500, 7600, 6900],
  },
  heavy: {
    sleep: [6.2, 5.8, 5.1, 5.5, 5.9, 5.2, 5.6],
    lateScreen: [70, 90, 85, 60, 95, 75, 80],
    steps: [4200, 3100, 3900, 2800, 3600, 4400, 3300],
  },
};
export const SCENARIO_IDS = Object.keys(SCENARIOS);
export const DEFAULT_SCENARIO = "exams";

// When a signal counts as "different from usual". Kept deliberately coarse:
// it is a nudge for which question to ask first, not a measurement of anything.
const RULES = {
  sleep: (mean, usual) => mean <= usual - 0.75,      // 45 min less sleep a night
  lateScreen: (mean, usual) => mean >= usual + 30,   // 30 min more after midnight
  steps: (mean, usual) => mean <= usual * 0.75,      // a quarter fewer steps
};

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** This week's signals for a scenario: daily values, mean, usual, and whether it stands out. */
export function weekSignals(scenarioId) {
  const s = SCENARIOS[scenarioId] ?? SCENARIOS[DEFAULT_SCENARIO];
  return SIGNAL_IDS.map((id) => {
    const mean = avg(s[id]);
    const usual = USUAL[id];
    return { id, days: s[id], mean, usual, notable: RULES[id](mean, usual), direction: mean < usual ? "lower" : mean > usual ? "higher" : "same" };
  });
}

/** The signals that stand out for one question, using the question's `signals` list from the config. */
export function signalsFor(question, signals) {
  if (!signals) return [];
  const wanted = question.signals ?? [];
  return signals.filter((s) => s.notable && wanted.includes(s.id));
}

/**
 * Questions with a notable signal come first; otherwise the config order is kept.
 * All questions are still asked, so the burden and the scoring do not change.
 */
export function orderQuestions(questions, signals) {
  if (!signals) return questions;
  return questions
    .map((q, i) => ({ q, i, hit: signalsFor(q, signals).length > 0 }))
    .sort((a, b) => (b.hit - a.hit) || (a.i - b.i))
    .map((x) => x.q);
}
