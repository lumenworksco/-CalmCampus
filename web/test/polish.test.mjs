import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { typography } from "../src/lib/i18n.js";
import { levelRanges, resultFor, countYes } from "../src/lib/scoring.js";

// Generic behaviour is tested on the default config; a tailored university branch adds
// its own checks in test/<id>.test.mjs.
const uni = JSON.parse(readFileSync(new URL("../config/universities/default.json", import.meta.url), "utf8"));

test("French spacing keeps ? and : with their word", () => {
  assert.equal(typography("Tout supprimer sur ce téléphone ?", "fr"), "Tout supprimer sur ce téléphone ?");
  assert.equal(typography("Propose : la liste", "fr"), "Propose : la liste");
  assert.equal(typography("Is it ok ?", "en"), "Is it ok ?", "English is left alone");
});

test("numbers, phone numbers and hours never break across lines", () => {
  assert.equal(typography("En anglais : 0800 143 000.", "fr"), "En anglais : 0800 143 000.");
  assert.equal(typography("écoute 24 h/24", "fr"), "écoute 24 h/24");
  assert.equal(typography("6 h 10 min a night", "en"), "6 h 10 min a night");
});

test("typographic apostrophes", () => {
  assert.equal(typography("d'habitude", "fr"), "d’habitude");
  assert.equal(typography("phone's own", "en"), "phone’s own");
});

test("each level shows the range of yes answers that leads to it", () => {
  const r = levelRanges(uni).map(({ level, lo, hi }) => `${level.id}:${lo}-${hi}`);
  assert.deepEqual(r, ["steady:0-0", "notice:1-1", "support:2-2", "care:3-4"]);
});

test("a skipped question is not a yes", () => {
  const a = { sleep: true, planning: null, energy: null, connection: false };
  assert.equal(countYes(uni, a), 1);
  assert.equal(resultFor(uni, a).level.id, "notice");
});
