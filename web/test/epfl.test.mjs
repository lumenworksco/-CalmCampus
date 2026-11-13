// EPFL-specific checks. This file only exists on the EPFL branch (epfl-web-demo);
// the generic behaviour is tested on the default config in the other test files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { levelFor, levelRanges } from "../src/lib/scoring.js";
import { pickLanguage } from "../src/lib/i18n.js";

const epfl = JSON.parse(readFileSync(new URL("../config/universities/epfl.json", import.meta.url), "utf8"));

test("EPFL routing: 1-2 yes to the social consultation, 3-4 to the CHUV", () => {
  const expected = { 0: ["steady", null], 1: ["notice", "social"], 2: ["support", "social"], 3: ["care", "clinical"], 4: ["care", "clinical"] };
  for (const [n, [id, service]] of Object.entries(expected)) {
    const lv = levelFor(epfl, Number(n));
    assert.equal(lv.id, id); assert.equal(lv.service, service);
  }
  assert.deepEqual(levelRanges(epfl).map(({ lo, hi }) => `${lo}-${hi}`), ["0-0", "1-1", "2-2", "3-4"]);
});

test("EPFL opens in French unless the phone asks for English", () => {
  assert.equal(pickLanguage(epfl, { browser: ["de-CH"] }), "fr");
  assert.equal(pickLanguage(epfl, { browser: ["en-GB"] }), "en");
});

test("EPFL details: sourced services, emergency numbers, phone link and QR code", () => {
  for (const s of Object.values(epfl.services)) {
    assert.match(s.source, /^https:\/\/www\.epfl\.ch\//);
    assert.match(s.verified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(s.contact.email, "every EPFL service has an email");
  }
  assert.deepEqual(epfl.emergency.map((e) => e.tel), ["+41216933000", "0848133133", "144", "143"]);
  assert.ok(epfl.emergency.every((e) => e.source));
  assert.equal(epfl.publicUrl, "https://cc.braunf.com/epfl/");
  assert.ok(existsSync(new URL(`../${epfl.qr}`, import.meta.url)));
  assert.deepEqual(epfl.nameInText, { fr: "l'EPFL", en: "EPFL" });
});
