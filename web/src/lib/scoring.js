// Turns four yes/no answers into a level. Thresholds live in the university
// config (`levels`), not here. This is a pointer to support, not a score or a
// diagnosis, and the number of "yes" answers is never shown as a grade.

export function countYes(config, answers) {
  return config.questions.filter((q) => answers[q.id] === true).length;
}

/** Highest level whose minYes is reached. Levels need not be sorted. */
export function levelFor(config, yesCount) {
  const sorted = [...config.levels].sort((a, b) => a.minYes - b.minYes);
  let found = sorted[0];
  for (const level of sorted) if (yesCount >= level.minYes) found = level;
  return found;
}

export function resultFor(config, answers) {
  const yes = countYes(config, answers);
  const level = levelFor(config, yes);
  return { yes, total: config.questions.length, level };
}

/** Answers that land exactly on a level, for demo previews. */
export function answersForLevel(config, level) {
  const answers = {};
  config.questions.forEach((q, i) => { answers[q.id] = i < level.minYes; });
  return answers;
}
