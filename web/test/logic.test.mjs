import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { levelFor, resultFor, answersForLevel, countYes } from "../src/lib/scoring.js";
import { weekKey, weekStart, addWeeks } from "../src/lib/week.js";
import { createStore } from "../src/lib/store.js";
import { demoEntries } from "../src/lib/demo.js";
import { loc, translate, pickLanguage } from "../src/lib/i18n.js";
import { resolveUniversityId, loadConfig } from "../src/lib/config.js";

const cfg = (id) => JSON.parse(readFileSync(new URL(`../config/universities/${id}.json`, import.meta.url), "utf8"));
// Generic behaviour is tested on the default config; a tailored university branch adds
// its own checks in test/<id>.test.mjs.
const uni = cfg("default");

function memStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } };
}

test("levels map yes-counts to the configured service", () => {
  const expected = { 0: ["steady", null], 1: ["notice", "counselling"], 2: ["support", "counselling"], 3: ["care", "clinical"], 4: ["care", "clinical"] };
  for (const [n, [id, service]] of Object.entries(expected)) {
    const lv = levelFor(uni, Number(n));
    assert.equal(lv.id, id); assert.equal(lv.service, service);
  }
});

test("resultFor counts only explicit yes answers", () => {
  const a = { sleep: true, planning: false, energy: true };
  assert.equal(countYes(uni, a), 2);
  assert.equal(resultFor(uni, a).level.id, "support");
});

test("answersForLevel lands exactly on each level", () => {
  for (const lv of uni.levels) assert.equal(resultFor(uni, answersForLevel(uni, lv)).level.id, lv.id);
});

test("ISO weeks, including year boundaries", () => {
  assert.equal(weekKey(new Date(2026, 0, 1)), "2026-W01");
  assert.equal(weekKey(new Date(2025, 11, 29)), "2026-W01");
  assert.equal(weekKey(new Date(2027, 0, 1)), "2026-W53");
  assert.equal(weekKey(new Date(2026, 10, 12)), "2026-W46");
  assert.equal(weekStart(new Date(2026, 10, 12)), "2026-11-09");
  assert.equal(weekKey(addWeeks(new Date(2026, 10, 12), -1)), "2026-W45");
});

test("demo history covers every level and stays in its own key", () => {
  const entries = demoEntries(uni, new Date(2026, 10, 12));
  assert.equal(entries.length, 6);
  const seen = new Set(entries.map((e) => resultFor(uni, e.answers).level.id));
  for (const lv of uni.levels) assert.ok(seen.has(lv.id), `demo is missing ${lv.id}`);
  assert.equal(new Set(entries.map((e) => e.week)).size, 6);
  assert.ok(entries.every((e) => e.demo === true));

  const store = createStore(memStorage(), "uni-a");
  store.save({ week: "2026-W46", date: "2026-11-12", answers: { sleep: true }, qv: {} });
  store.setDemo(true, entries);
  assert.equal(store.entries().length, 6);
  store.save({ week: "2026-W46", date: "2026-11-12", answers: { sleep: false }, qv: {} });
  store.setDemo(false);
  assert.deepEqual(store.entries().map((e) => e.answers), [{ sleep: true }], "real answers untouched by demo mode");
});

test("demo mode is per university", () => {
  const s = memStorage();
  createStore(s, "uni-b").setDemo(true, []);
  assert.equal(createStore(s, "uni-a").isDemo(), false);
  assert.equal(createStore(s, "uni-b").isDemo(), true);
});

test("a new check-in replaces the same week", () => {
  const store = createStore(memStorage(), "uni-a");
  store.save({ week: "2026-W46", date: "2026-11-12", answers: { sleep: true }, qv: {} });
  store.save({ week: "2026-W46", date: "2026-11-13", answers: { sleep: false }, qv: {} });
  assert.equal(store.entries().length, 1);
  assert.equal(store.entries()[0].answers.sleep, false);
});

test("clearAll removes every CalmCampus key and nothing else", () => {
  const s = memStorage();
  s.setItem("other-app", "keep");
  const store = createStore(s, "uni-a");
  store.save({ week: "2026-W46", date: "2026-11-12", answers: {}, qv: {} });
  store.setLang("fr"); store.setDemo(true, []); store.markTried("results"); store.setWelcomed();
  createStore(s, "uni-b").save({ week: "2026-W45", date: "2026-11-05", answers: {}, qv: {} });
  store.clearAll();
  assert.equal(s.length, 1);
  assert.equal(s.getItem("other-app"), "keep");
  assert.equal(store.entries().length, 0);
});

test("store falls back to memory when storage throws", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); }, key() { throw new Error("x"); }, get length() { throw new Error("x"); } };
  const store = createStore(broken, "uni-a");
  store.save({ week: "2026-W46", date: "2026-11-12", answers: { sleep: true }, qv: {} });
  assert.equal(store.entries().length, 1);
  assert.doesNotThrow(() => store.clearAll());
});

test("i18n helpers", () => {
  assert.equal(loc({ fr: "a", en: "b" }, "en", "fr"), "b");
  assert.equal(loc({ fr: "a" }, "en", "fr"), "a");
  assert.equal(translate({ a: { b: "Hi {name}" } }, "a.b", { name: "Zoe" }), "Hi Zoe");
  assert.equal(translate({}, "x.y"), "x.y");
  assert.equal(pickLanguage(uni, { search: "?lang=fr", stored: "en" }), "fr");
  assert.equal(pickLanguage(uni, { stored: "fr", browser: ["en-US"] }), "fr");
  assert.equal(pickLanguage(uni, { browser: ["fr-CH"] }), "fr");
  assert.equal(pickLanguage(uni, { browser: ["de-CH"] }), uni.defaultLanguage);
  assert.equal(pickLanguage(uni, { search: "?lang=de" }), uni.defaultLanguage);
});

test("university selection by URL or folder, with a safe fallback", async () => {
  assert.equal(resolveUniversityId("?u=uni-a", "default"), "uni-a");
  assert.equal(resolveUniversityId("", "uni-a"), "uni-a");
  assert.equal(resolveUniversityId("?u=../etc", "uni-a"), "default");
  assert.equal(resolveUniversityId("", null), "default");
  const fetchFn = async (url) => url.includes("nope") ? { ok: false, status: 404 } : { ok: true, json: async () => ({ id: url }) };
  assert.equal((await loadConfig("nope", fetchFn)).fellBack, true);
  assert.equal((await loadConfig("uni-a", fetchFn)).fellBack, false);
});

test("the reviewer guide remembers what was tried, per university", () => {
  const s = memStorage();
  const a = createStore(s, "uni-a");
  assert.deepEqual(a.tried(), []);
  a.markTried("results"); a.markTried("results"); a.markTried("scenario:exams");
  assert.deepEqual(a.tried(), ["results", "scenario:exams"]);
  assert.deepEqual(createStore(s, "uni-b").tried(), []);
  a.clearAll();
  assert.deepEqual(a.tried(), []);
});
