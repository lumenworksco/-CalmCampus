import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCENARIO_IDS, SIGNAL_IDS, weekSignals, signalsFor, orderQuestions } from "../src/lib/signals.js";
import { createStore } from "../src/lib/store.js";

// Generic behaviour is tested on the default config; a tailored university branch adds
// its own checks in test/<id>.test.mjs.
const uni = JSON.parse(readFileSync(new URL("../config/universities/default.json", import.meta.url), "utf8"));
const notable = (id) => weekSignals(id).filter((s) => s.notable).map((s) => s.id).sort();
const ids = (qs) => qs.map((q) => q.id);

test("each example week stands out where it should", () => {
  assert.deepEqual(notable("steady"), []);
  assert.deepEqual(notable("exams"), ["lateScreen", "sleep"]);
  assert.deepEqual(notable("heavy"), ["lateScreen", "sleep", "steps"]);
  for (const id of SCENARIO_IDS) for (const s of weekSignals(id)) assert.equal(s.days.length, 7);
});

test("questions with a notable signal come first; all four are still asked", () => {
  assert.deepEqual(ids(orderQuestions(uni.questions, null)), ["sleep", "planning", "energy", "connection"]);
  assert.deepEqual(ids(orderQuestions(uni.questions, weekSignals("steady"))), ["sleep", "planning", "energy", "connection"]);
  assert.deepEqual(ids(orderQuestions(uni.questions, weekSignals("heavy"))), ["sleep", "energy", "planning", "connection"]);
  assert.equal(orderQuestions(uni.questions, weekSignals("exams")).length, 4);
});

test("signals map to questions through the config", () => {
  const q = (id) => uni.questions.find((x) => x.id === id);
  assert.deepEqual(signalsFor(q("sleep"), weekSignals("exams")).map((s) => s.id), ["sleep", "lateScreen"]);
  assert.deepEqual(signalsFor(q("planning"), weekSignals("heavy")), []);
  for (const x of uni.questions) for (const s of x.signals ?? []) assert.ok(SIGNAL_IDS.includes(s));
});

test("the example week is cleared with demo mode", () => {
  const m = new Map();
  const st = createStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } }, "uni-a");
  st.setDemo(true, []); st.setScenario("heavy");
  assert.equal(st.getScenario(), "heavy");
  st.setDemo(false);
  assert.equal(st.getScenario(), null);
});
