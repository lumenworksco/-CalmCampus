import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { institutionConfig, institutionsOf } from "../src/lib/config.js";
import { resultFor } from "../src/lib/scoring.js";
import { createStore } from "../src/lib/store.js";

// A config for students of several universities: each institution brings its own
// services, levels and campus numbers; the shared numbers apply to everyone.
const base = {
  id: "multi", name: "Multi", languages: ["en"], defaultLanguage: "en",
  questions: ["a", "b", "c", "d"].map((id) => ({ id, version: 1, text: { en: id } })),
  levels: [{ id: "steady", minYes: 0, service: null }, { id: "notice", minYes: 1, service: null }, { id: "support", minYes: 2, service: null }, { id: "care", minYes: 3, service: null }],
  services: {},
  emergency: [{ id: "eu", number: "112", tel: "112" }],
  institutions: [
    {
      id: "uni-a", name: { en: "Uni A" },
      services: { talk: { name: { en: "Talk" } }, deep: { name: { en: "Deep" } } },
      levels: [{ id: "steady", minYes: 0, service: null }, { id: "notice", minYes: 1, service: "talk" }, { id: "support", minYes: 2, service: "talk" }, { id: "care", minYes: 3, service: "deep" }],
      emergency: [{ id: "campus", number: "016 00 00 00", tel: "016000000" }],
    },
    { id: "other", name: { en: "Other" }, nameInText: { en: "your institution" }, services: {}, advice: { en: "Ask your student services." } },
  ],
};

test("an institution brings its own services, levels and campus numbers first", () => {
  const c = institutionConfig(base, "uni-a");
  assert.deepEqual(Object.keys(c.services), ["talk", "deep"]);
  assert.deepEqual(c.emergency.map((e) => e.tel), ["016000000", "112"]);
  assert.equal(resultFor(c, { a: true, b: false, c: false, d: false }).level.service, "talk");
  assert.equal(resultFor(c, { a: true, b: true, c: true, d: null }).level.service, "deep");
  assert.equal(c.institution, "uni-a");
  assert.equal(c.id, "multi", "answers stay under the config's own storage keys");
});

test("'Other' keeps only the shared numbers and gives advice", () => {
  const c = institutionConfig(base, "other");
  assert.deepEqual(Object.keys(c.services), []);
  assert.deepEqual(c.emergency.map((e) => e.tel), ["112"]);
  assert.equal(c.levels, base.levels);
  assert.equal(c.advice.en, "Ask your student services.");
  assert.equal(c.nameInText.en, "your institution");
});

test("no choice, an unknown choice, or a single-university config: the config as it is", () => {
  assert.equal(institutionConfig(base, null), base);
  assert.equal(institutionConfig(base, "nope"), base);
  const single = JSON.parse(readFileSync(new URL("../config/universities/default.json", import.meta.url), "utf8"));
  assert.equal(institutionConfig(single, "uni-a"), single);
  assert.deepEqual(institutionsOf(single), []);
});

test("the choice is stored per config and cleared by Start over", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), key: (i) => [...mem.keys()][i], get length() { return mem.size; } };
  const store = createStore(storage, "multi");
  store.setUni("uni-a");
  assert.equal(mem.get("cc:multi:uni"), "uni-a");
  store.clearAll();
  assert.equal(store.getUni(), null);
});
