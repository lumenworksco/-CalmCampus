import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { institutionConfig } from "../src/lib/config.js";
import { resultFor } from "../src/lib/scoring.js";

// Quivr: a preview for a student app used across Flemish universities. Every service
// and number below was copied from the institution's or the operator's own pages.
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const cfg = JSON.parse(read("config/universities/quivr.json"));
const OWN_DOMAIN = { kuleuven: "kuleuven.be", kulak: "kuleuven.be", ugent: "ugent.be", uantwerpen: "uantwerpen.be", vub: "vub.be", uhasselt: "uhasselt.be" };
const answers = (yes) => Object.fromEntries(cfg.questions.map((q, i) => [q.id, i < yes]));

test("Dutch first, then English and French", () => {
  assert.deepEqual(cfg.languages, ["nl", "en", "fr"]);
  assert.equal(cfg.defaultLanguage, "nl");
});

test("the same four questions as the EPFL preview, with the same ids", () => {
  assert.deepEqual(cfg.questions.map((q) => q.id), ["sleep", "planning", "energy", "connection"]);
  for (const q of cfg.questions) assert.ok(q.text.nl && q.text.en && q.text.fr, q.id);
});

test("the universities Quivr covers, then Other", () => {
  assert.deepEqual(cfg.institutions.map((i) => i.id), ["kuleuven", "kulak", "ugent", "uantwerpen", "vub", "uhasselt", "other"]);
});

test("every service comes from the university's own pages, with a date", () => {
  for (const inst of cfg.institutions.filter((i) => i.id !== "other")) {
    for (const [id, s] of Object.entries(inst.services)) {
      const where = `${inst.id}.${id}`;
      assert.match(s.verified, /^\d{4}-\d{2}-\d{2}$/, where);
      for (const url of [s.source, ...(s.sources ?? []), ...Object.values(s.contact.link ?? {})]) {
        assert.ok(new URL(url).hostname.endsWith(OWN_DOMAIN[inst.id]), `${where}: ${url}`);
      }
      for (const field of ["email", "phone", "hours"]) {
        const known = s.contact[field] != null;
        const accounted = [...(s.todo ?? []), ...(s.notPublished ?? [])].some((x) => x.startsWith(field) || x.includes(`${field}`));
        assert.ok(known || accounted, `${where}: ${field} is neither filled nor listed in todo / notPublished`);
      }
    }
  }
});

test("routing: 0 yes to the support list, 1-2 and 3-4 yes to the university's own services", () => {
  const expect = {
    kuleuven: [null, "firstline", "firstline", "psychotherapy", "psychotherapy"],
    kulak: [null, "wellbeing", "wellbeing", "wellbeing", "wellbeing"],
    ugent: [null, "psychologists", "psychologists", "psychologists", "psychologists"],
    uantwerpen: [null, "stip", "stip", "stip", "stip"],
    vub: [null, "psychologists", "psychologists", "psychologists", "psychologists"],
    uhasselt: [null, "psychologist", "psychologist", "psychologist", "psychologist"],
    other: [null, null, null, null, null],
  };
  for (const [id, services] of Object.entries(expect)) {
    const c = institutionConfig(cfg, id);
    services.forEach((svc, yes) => assert.equal(resultFor(c, answers(yes)).level.service, svc, `${id} with ${yes} yes`));
  }
});

test("'Other' gives only the national lines and general advice", () => {
  const c = institutionConfig(cfg, "other");
  assert.deepEqual(Object.keys(c.services), []);
  assert.deepEqual(c.emergency.map((e) => e.tel), ["112", "1813", "106", "107", "080032123"]);
  for (const l of cfg.languages) assert.ok(c.advice[l].length > 40, l);
});

test("national lines verified on the operators' own sites; campus numbers first", () => {
  const sources = Object.fromEntries(cfg.emergency.map((e) => [e.tel, new URL(e.source).hostname]));
  assert.deepEqual(sources, { 112: "www.112.be", 1813: "www.zelfmoord1813.be", 106: "www.tele-onthaal.be", 107: "www.tele-accueil.be", "080032123": "www.preventionsuicide.be" });
  assert.equal(institutionConfig(cfg, "kuleuven").emergency[0].tel, "016322222");
  assert.equal(institutionConfig(cfg, "ugent").emergency[0].tel, "092648888");
  assert.equal(institutionConfig(cfg, "vub").emergency[0].tel, "+3226291111");
  assert.equal(institutionConfig(cfg, "uantwerpen").emergency[0].tel, "112", "UAntwerpen publishes no campus number");
});

test("it says what it is: a preview for Quivr to review, and a mockup", () => {
  assert.equal(cfg.welcomeNote.en, "This is a preview made for Quivr to review. It is not a Quivr feature, and Quivr has not agreed to anything.");
  const view = cfg.pages.find((p) => p.id === "quivr-view");
  assert.equal(view.frame.label.en, "Mockup: how this could look in Quivr, not a live Quivr feature");
  assert.equal(view.frame.card.text.en, "Weekly check-in: 4 questions, less than a minute. Private, stays on your phone.");
  assert.equal(cfg.logo.image, null, "no Quivr logo without permission");
  assert.equal(cfg.feedback.email, "contact@calm.braunf.com");
  assert.equal(cfg.feedback.subject.en, "Feedback on the CalmCampus preview (Quivr)");
});

test("numbers on the pages are labelled as targets or examples, never as results", () => {
  const tables = cfg.pages.flatMap((p) => (p.blocks ?? []).filter((b) => b.table).map((b) => b.table));
  assert.deepEqual(tables.map((t) => t.label).sort(), ["example", "target"]);
  assert.equal(tables.find((t) => t.label === "target").note.en, "Proposed target, to agree with Quivr in advance, not a result.");
});

test("footer, time claim and names, in every language", () => {
  const ui = Object.fromEntries(cfg.languages.map((l) => [l, JSON.parse(read(`src/i18n/${l}.json`))]));
  assert.ok(ui.en.disclaimer.startsWith("We are students, not medical professionals."));
  assert.ok(ui.nl.disclaimer.startsWith("We zijn studenten, geen zorgverleners."));
  assert.ok(ui.fr.disclaimer.startsWith("Nous sommes des étudiant·es, pas des professionnel·les de santé."));
  for (const l of cfg.languages) assert.ok(ui[l].about.credit.includes("Florian Braùn") && ui[l].about.credit.includes("Hélène David"), l);
  const all = [read("config/universities/quivr.json"), ...readdirSync(new URL("../src/i18n/", import.meta.url)).map((f) => read(`src/i18n/${f}`))].join("\n");
  assert.ok(!/Braun\b|Braün/.test(all), "the surname is Braùn");
  assert.ok(!/under a minute/.test(all), "the claim is \"less than a minute\"");
});
