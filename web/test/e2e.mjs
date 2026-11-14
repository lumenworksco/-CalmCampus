// End-to-end check of the reviewer preview in real browser engines: WebKit (iPhone
// SE, iPhone 14) and Chromium (Pixel 7, a desktop window), plus offline use.
// It serves dist/ itself, or checks a deployed copy when E2E_URL is set.
//
//   npm run build && npm run e2e
//   E2E_URL=https://cc.braunf.com/<id>/ npm run e2e      # after deploying
//
// It tests the university of this branch: the one config besides "default" if there
// is one (a tailored branch), else "default" (main). E2E_UNI=<id> picks another.
// Every expected text comes from that config and from src/i18n, so it works for any
// university without changes.
//
// Needs Playwright, which the app itself does not use. Install it once, outside the
// project's dependencies:  npm i --no-save playwright && npx playwright install webkit chromium
import http from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loc, translate, typography } from "../src/lib/i18n.js";
import { levelFor, levelRanges } from "../src/lib/scoring.js";
import { orderQuestions, signalsFor, weekSignals } from "../src/lib/signals.js";
import { institutionsOf, institutionConfig } from "../src/lib/config.js";

let pw;
try { pw = await import("playwright"); } catch {
  console.error("Playwright is not installed. Run: npm i --no-save playwright && npx playwright install webkit chromium");
  process.exit(2);
}
const { webkit, chromium, devices } = pw;

/* ---------- What to test, and what it should say ---------- */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const ids = readdirSync(path.join(root, "config/universities")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const uniId = process.env.E2E_UNI ?? ids.find((id) => id !== "default") ?? "default";
const cfg = json(`config/universities/${uniId}.json`);
const langs = cfg.languages;
const ui = Object.fromEntries([...new Set(["en", ...langs])].map((l) => [l, json(`src/i18n/${l}.json`)]));
const hasFr = langs.includes("fr");
// A config for several universities: the phone journeys pick the first one; every
// university is checked in institutionFlows().
const insts = institutionsOf(cfg);
const firstInst = insts[0]?.id ?? null;
const eff = institutionConfig(cfg, firstInst);
const nameOf = (conf, lang) => loc(conf.nameInText, lang, cfg.defaultLanguage) ?? loc(conf.name, lang, cfg.defaultLanguage);
const T = (lang, key, vars = {}, conf = eff) => typography(translate(ui[lang], key, { name: nameOf(conf, lang), ...vars }), lang);
const C = (lang, value) => typography(loc(value, lang, cfg.defaultLanguage), lang);
const tryTitle = (i) => typography(ui.en.about.try[i].h, "en");
const guide = Array.isArray(cfg.tries) && cfg.tries.length ? cfg.tries : null;
const tryCount = guide ? guide.length : ui.en.about.try.length;
const afterStartOver = guide && insts.length ? guide.filter((x) => (x.marks ?? [x.id]).every((m) => m === "uni")).length : 0;
// Content rules checked on every screen a journey visits.
const SECONDS = /\b\d+\s?(?:s|sec)(?![\p{L}\d])|\b(?:seconds?|secondes?|seconden?)\b/iu;
const LESS = { en: "less than a minute", fr: "moins d’une minute", nl: "minder dan een minuut" };
const total = cfg.questions.length;
const heavy = orderQuestions(cfg.questions, weekSignals("heavy"));
const calm = orderQuestions(cfg.questions, weekSignals("steady"));

/* ---------- A static server for dist/, unless a deployed copy is tested ---------- */

const dist = path.join(root, "dist");
const live = process.env.E2E_URL;
const folder = uniId === "default" ? "" : `${uniId}/`;
if (!live && !existsSync(path.join(dist, folder, "index.html"))) { console.error("Run npm run build first."); process.exit(2); }

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(readFileSync(f));
});
if (!live) { server.listen(0); await new Promise((r) => server.once("listening", r)); }
const base = live ?? `http://localhost:${server.address().port}/${folder}`;
const origin = new URL(base).origin;

let checks = 0;
const fails = [];
// On CI: more time per step (shared machines are slower), and each failure becomes a
// GitHub annotation, readable on the run page without access to the full log.
const slow = Boolean(process.env.CI);
const annotate = (msg) => { if (process.env.GITHUB_ACTIONS) console.log(`::error title=End-to-end::${msg.replace(/\r?\n/g, " ")}`); };

async function until(page, fn, arg, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg)) return true;
    await page.waitForTimeout(40);
  }
  return false;
}

/* ---------- Helpers shared by the journeys ---------- */

/** After Start: a config for several universities asks which one, once. */
async function pickFirst(p, ok, settle) {
  if (!insts.length) return;
  ok(await p.evaluate(() => location.hash) === "#/pick", "after Start, the university picker comes first");
  await p.click(`[data-uni="${firstInst}"]`); await settle();
}

/** On every screen: the footer, no time in seconds, and the team's names spelled right. */
async function rules(p, ok, lang, where) {
  const footer = ((await p.textContent("#disclaimer")) ?? "").trim();
  ok(footer === T(lang, "disclaimer"), `${where}: the footer reads "${T(lang, "disclaimer")}" (got "${footer}")`);
  const text = await p.evaluate(() => document.body.innerText);
  ok(!SECONDS.test(text), `${where}: no time in seconds`);
  ok(!/Braun\b|Braün/.test(text), `${where}: the surname is written Braùn`);
}

/** Support: every service's email, website and phone, and the emergency numbers in order. */
async function supportLinks(p, ok, conf, lang, L) {
  for (const [id, s] of Object.entries(conf.services)) {
    const hrefs = await p.locator(`section.service[aria-labelledby="s-${id}"] a`).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    if (s.contact.email) ok(hrefs.includes(`mailto:${s.contact.email}`), `${L}: ${id} email link`);
    const site = loc(s.contact.link, lang, cfg.defaultLanguage);
    if (site) ok(hrefs.includes(site), `${L}: ${id} website link`);
    if (s.contact.phone) ok(hrefs.includes(`tel:${s.contact.phone.replace(/\s/g, "")}`), `${L}: ${id} phone link`);
  }
  const tels = await p.locator(".emergency a.call").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ok(JSON.stringify(tels) === JSON.stringify(conf.emergency.map((e) => `tel:${e.tel}`)), `${L}: emergency numbers dial the configured numbers (got ${tels.join(" ")})`);
}

/* ---------- A reviewer's whole journey on a phone ---------- */

async function phone(name, browserType, device, os) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ ...device });
  const p = await context.newPage();
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(`${name}: ${msg}`); };
  p.on("pageerror", (e) => fails.push(`${name}: page error ${e.message}`));
  p.on("request", (r) => { if (!r.url().startsWith(origin)) fails.push(`${name}: request to another host ${r.url()}`); });
  const settle = () => p.waitForTimeout(slow ? 600 : 260);
  const h1 = () => p.textContent("h1");
  const hash = () => p.evaluate(() => location.hash);
  const shows = async (text) => (await p.evaluate(() => document.body.textContent)).includes(text);
  const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await settle(); };
  const fits = async (where, lang = "en") => {
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `wider than the screen on ${where}`);
    await rules(p, ok, lang, where);
  };
  const staysPut = async (sel, keep, label) => {
    await p.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await p.waitForTimeout(60);
    const top = () => p.evaluate((k) => document.querySelector(`[data-keep="${k}"]`)?.getBoundingClientRect().top, keep);
    const before = await top();
    await p.locator(sel).first().click();
    await settle();
    const after = await top();
    ok(after !== undefined && Math.abs(after - before) <= 2, `${label} moved the page (${before} -> ${after})`);
  };
  const answer = async (v) => { await p.click(`[data-answer="${v}"]`); await settle(); };

  // Welcome
  await p.goto(`${base}?lang=en`);
  await p.waitForSelector("[data-welcome]");
  ok(await h1() === T("en", "welcome.title"), "the welcome screen comes first");
  ok(await shows(T("en", "welcome.lead", {}, cfg)), "the welcome screen says what CalmCampus is");
  ok((await p.$$("#nav a")).length === 0, "no tabs on the welcome screen");
  ok(!(await p.$(".preview-strip")), "no preview line on the welcome screen");
  ok((await p.$$(".install .steps li")).length === ui.en.install[os].length, "numbered install steps for this phone");
  await fits("welcome");
  if (hasFr) {
    await p.click('[data-hlang="fr"]'); await settle();
    ok(await h1() === T("fr", "welcome.title"), "language switch on the welcome screen");
    await p.click('[data-hlang="en"]'); await settle();
  }
  await p.click("[data-welcome]"); await settle();
  await pickFirst(p, ok, settle);
  ok((await p.$$("#nav a")).length === 4, "four tabs after Start");
  ok(await shows(T("en", "preview.tryLink")), "the preview line leads to the guide");
  await fits("home");

  // A difficult week: the check-in with a double tap, a skip and the back button
  await staysPut('[data-scenario="heavy"]', "signals", "choosing an example week");
  await p.evaluate(() => scrollTo(0, 0));
  await p.click('a[href="#/check/0"]'); await settle();
  ok(!(await p.$(".preview-strip")), "no preview line during the check-in");
  ok(await p.textContent("#q") === C("en", heavy[0].text), "the question with a notable signal comes first");
  if (signalsFor(heavy[0], weekSignals("heavy")).length) ok(await shows(T("en", "signals.noticedHeading")), "the phone hint is shown");
  await fits("question");
  await p.click('[data-answer="yes"]'); await p.click('[data-answer="yes"]', { force: true }); await settle(); await settle();
  ok(await hash() === "#/check/1", `a double tap answers one question only (at ${await hash()})`);
  ok(await p.textContent("#q") === C("en", heavy[1].text), "the questions follow the phone signals");
  await answer("no");
  if (!heavy[2].signals?.length) ok(await shows(T("en", "signals.noSignal")), "questions without a signal say so");
  await answer("skip");
  await answer("yes");
  const level = levelFor(eff, 2);
  ok(await h1() === T("en", `result.levels.${level.id}.title`), `two yes answers and one skip give "${level.id}" (got ${await h1()})`);
  ok(await shows(T("en", "result.skipped", { n: 1, total })), "skipped questions are counted");
  ok(await shows(T("en", "signals.resultHeading")), "the result shows what the phone noticed");
  ok(await shows(level.service ? C("en", eff.services[level.service].name) : T("en", "result.seeSupport")), "the result points to the configured next step");
  if (!guide) ok(((await p.textContent(".next-try")) ?? "").includes(tryTitle(1)), "the result suggests the next thing to try");
  else ok(Boolean(await p.$(".next-try")), "the result suggests the next thing to try");
  await fits("result");
  await p.goBack(); await settle();
  ok(!(await hash()).startsWith("#/check"), `the back button leaves the finished check-in (at ${await hash()})`);
  await go("#/check/2");
  ok(await hash() === "#/check/0", "a check-in never starts in the middle");

  // A calm week: the redo prompt, nothing unusual, and a result keeps its week
  await go("#/");
  await p.click('[data-scenario="steady"]'); await settle();
  ok(await shows(T("en", "signals.redoPrompt")), "after picking another week, Home invites a redo");
  await p.click('.redo a[href="#/check/0"]'); await settle();
  if (calm[0].signals?.length) ok(await shows(T("en", "signals.unremarkable")), "a calm week says nothing unusual");
  for (let i = 0; i < total; i++) await answer("no");
  ok(await h1() === T("en", "result.levels.steady.title"), "all no answers are steady");
  await go("#/");
  ok(!(await p.$(".redo")), "no redo prompt once the check-in matches the week");
  await p.click('[data-scenario="heavy"]'); await settle();
  await p.click('a[href^="#/result/"]'); await settle();
  ok(await shows(T("en", "signals.resultNone")), "a result keeps the example week it was done with");

  // My weeks and Support
  await p.click('#nav a[href="#/history"]'); await settle();
  ok((await p.$$(".week-list li")).length === 7, "one own week and six examples");
  ok((await p.$$(".chart .col")).length <= 7, "the chart fits seven weeks at most");
  await fits("my weeks");
  await p.click('#nav a[href="#/support"]'); await settle();
  ok((await p.$$(".service")).length === Object.keys(eff.services).length && await p.isVisible(".emergency"), "services and emergency numbers");
  await fits("support");

  // About: the guide, every result, feedback, language, privacy
  await p.click('#nav a[href="#/about"]'); await settle();
  ok((await p.$$(".try li")).length === tryCount, "the guide lists every thing to try");
  if (!guide) ok((await p.$$(".try .num.done")).length === 3 && await shows(T("en", "about.progress", { n: 3, total: 5 })), "the guide shows what was tried (check-in, another week, support)");
  const mail = await p.getAttribute('a.btn.sage[data-track="feedback"]', "href");
  ok((mail ?? "").startsWith(`mailto:${cfg.feedback.email}?subject=`) && (mail ?? "").includes("&body="), "feedback opens a prepared email");
  await fits("about");
  await p.click('.try a[href="#/results"]'); await settle();
  const list = await p.textContent(".level-list");
  for (const { level: lv, lo, hi } of levelRanges(eff)) {
    const range = lo === hi ? `${lo}` : `${lo}–${hi}`;
    const target = lv.service ? C("en", eff.services[lv.service].name) : T("en", "results.supportList");
    ok(list.includes(T("en", "results.yes", { range, total })) && list.includes(T("en", "results.suggests", { target })), `every result lists "${lv.id}" with its range and next step`);
  }
  ok(await shows(T("en", "results.emergencyNote")), "emergency note on every result");
  const top = levelRanges(eff).at(-1).level.id;
  await p.click(`a[href="#/preview/${top}"]`); await settle();
  ok(await shows(T("en", "result.exampleKicker")), "example results are labelled");
  await p.click('a.btn.sm[href="#/results"]'); await settle();
  await p.click('a.btn.sm[href="#/about"]'); await settle();
  if (!guide) ok((await p.$$(".try .num.done")).length === 4, "seeing every result counts as tried");
  if (hasFr) {
    await staysPut('[data-lang="fr"]', "lang", "switching to French");
    ok(await p.evaluate(() => document.documentElement.lang) === "fr", "the page language follows");
    await staysPut('[data-lang="en"]', "lang", "switching to English");
  }
  await p.locator('a[href="#/privacy"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
  const y = await p.evaluate(() => Math.round(scrollY));
  await p.click('a[href="#/privacy"]'); await settle();
  await p.click('a.btn.sm[href="#/about"]'); await settle();
  ok(Math.abs(await p.evaluate(() => Math.round(scrollY)) - y) < 3, "back from privacy lands where you were");

  // French text
  if (hasFr) {
    await p.click('[data-lang="fr"]'); await settle();
    await go("#/");
    await p.click('a[href="#/check/0"]'); await settle();
    const q = await p.textContent("#q");
    ok(q === C("fr", heavy[0].text) && (!loc(heavy[0].text, "fr").includes(" ?") || q.includes(" ?")), "French questions keep the question mark with the last word");
    await go("#/support");
    ok(await h1() === T("fr", "more.supportHeading"), `French support heading reads naturally (got ${await h1()})`);
    await p.click('[data-hlang="en"]'); await settle();
  }

  // Start over
  await go("#/about");
  await staysPut('[data-delete="ask"]', "delete", "asking to start over");
  await staysPut('[data-delete="no"]', "delete", "cancelling start over");
  await p.click('[data-delete="ask"]'); await settle();
  await p.click('[data-delete="yes"]'); await settle();
  ok(await h1() === T("en", "welcome.title"), "start over shows the welcome screen");
  await p.click("[data-welcome]"); await settle();
  await pickFirst(p, ok, settle);
  await p.click('#nav a[href="#/history"]'); await settle();
  ok((await p.$$(".week-list li")).length === 6, "start over keeps only the examples");
  await p.click('#nav a[href="#/about"]'); await settle();
  ok((await p.$$(".try .num.done")).length === afterStartOver, "start over resets the guide");

  await browser.close();
}

/* ---------- Every result level, Skip, links, feedback and Start over, in each language ---------- */

async function languageFlows(name, browserType, device) {
  const browser = await browserType.launch();
  const p = await (await browser.newContext({ ...device })).newPage();
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(`${name}: ${msg}`); };
  p.on("pageerror", (e) => fails.push(`${name}: page error ${e.message}`));
  p.on("request", (r) => { if (!r.url().startsWith(origin)) fails.push(`${name}: request to another host ${r.url()}`); });
  const settle = () => p.waitForTimeout(slow ? 600 : 260);
  const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await settle(); };
  const h1 = () => p.textContent("h1");
  const shows = async (text) => (await p.evaluate(() => document.body.textContent)).includes(text);
  const backText = async () => ((await p.textContent('a.btn.sm[href="#/about"]')) ?? "").trim();
  const ticked = (href) => p.evaluate((h) => Boolean(document.querySelector(`.try a[href="${h}"] .num.done`)), href);
  for (const lang of langs) {
    const L = lang.toUpperCase();
    await p.goto(`${base}?lang=${lang}`);
    await p.waitForSelector("[data-welcome]");
    await rules(p, ok, lang, `${L} welcome`);
    await p.click("[data-welcome]"); await settle();
    await pickFirst(p, ok, settle);
    ok(await shows(LESS[lang] ?? LESS.en), `${L}: Home says the check-in takes "${LESS[lang]}"`);

    // 0 to 4 yes answers: the level, where it points, and the emergency numbers every time
    for (let yes = 0; yes <= total; yes++) {
      await go("#/");
      await p.click('a[href="#/check/0"]'); await settle();
      for (let i = 0; i < total; i++) { await p.click(i < yes ? '[data-answer="yes"]' : '[data-answer="no"]'); await settle(); }
      const lv = levelFor(eff, yes);
      ok(await h1() === T(lang, `result.levels.${lv.id}.title`), `${L}: ${yes} yes gives "${lv.id}" (got ${await h1()})`);
      ok(await shows(lv.service ? C(lang, eff.services[lv.service].name) : T(lang, "result.seeSupport")), `${L}: ${yes} yes points to ${lv.service ?? "the support list"}`);
      await rules(p, ok, lang, `${L} result with ${yes} yes`);
      ok(await p.isVisible(".emergency"), `${L}: ${yes} yes shows the emergency numbers`);
    }

    // Skip: counted, and never a yes
    await go("#/");
    await p.click('a[href="#/check/0"]'); await settle();
    for (let i = 0; i < total; i++) { await p.click(i === 0 ? '[data-answer="yes"]' : i === 1 ? '[data-answer="skip"]' : '[data-answer="no"]'); await settle(); }
    ok(await shows(T(lang, "result.skipped", { n: 1, total })), `${L}: a skipped question is counted`);
    ok(await h1() === T(lang, `result.levels.${levelFor(eff, 1).id}.title`), `${L}: a skipped question is not a yes`);

    // My weeks
    await go("#/history");
    ok(await h1() === T(lang, "history.title") && (await p.$$(".week-list li")).length === 7, `${L}: My weeks shows one own week and six examples`);
    await rules(p, ok, lang, `${L} my weeks`);

    // Support: every service's email and website, and the emergency numbers
    await go("#/support");
    await supportLinks(p, ok, eff, lang, L);
    await rules(p, ok, lang, `${L} support`);

    // About: steps 3 and 4 tick once their page is opened; the pages under About go "Back"
    await go("#/about");
    ok(!(await ticked("#/results")), `${L}: step 3 is not ticked before the results page is opened`);
    ok(await ticked("#/support"), `${L}: step 4 is ticked once the Support tab was opened`);
    await p.click('.try a[href="#/results"]'); await settle();
    ok(await backText() === T(lang, "checkin.back"), `${L}: the results page's back button says "${T(lang, "checkin.back")}" (got "${await backText()}")`);
    await p.click('a.btn.sm[href="#/about"]'); await settle();
    ok(await ticked("#/results"), `${L}: step 3 is ticked once the results page was opened`);
    await go("#/privacy");
    ok(await backText() === T(lang, "checkin.back"), `${L}: the privacy page's back button says "${T(lang, "checkin.back")}" (got "${await backText()}")`);
    await rules(p, ok, lang, `${L} privacy`);

    // Feedback and Start over
    await go("#/about");
    const subject = typeof cfg.feedback.subject === "string" ? cfg.feedback.subject : loc(cfg.feedback.subject, lang, cfg.defaultLanguage);
    await rules(p, ok, lang, `${L} about`);
    const credit = await p.evaluate(() => [...document.querySelectorAll(".version")].map((x) => x.textContent).join(" "));
    ok(credit.includes("Florian Braùn") && credit.includes("Hélène David"), `${L}: About credits Florian Braùn and Hélène David`);
    const mail = (await p.getAttribute('a.btn.sage[data-track="feedback"]', "href")) ?? "";
    ok(mail.startsWith(`mailto:${cfg.feedback.email}?subject=${encodeURIComponent(subject)}&body=`), `${L}: Send feedback opens an email to ${cfg.feedback.email}`);
    await p.click('[data-delete="ask"]'); await settle();
    await p.click('[data-delete="yes"]'); await settle();
    ok(await h1() === T(lang, "welcome.title"), `${L}: Start over shows the welcome screen`);
  }
  await browser.close();
}

/* ---------- Several universities: each one's routing, links and numbers, in each language ---------- */

async function institutionFlows(name, browserType, device) {
  const browser = await browserType.launch();
  const p = await (await browser.newContext({ ...device })).newPage();
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(`${name}: ${msg}`); };
  p.on("pageerror", (e) => fails.push(`${name}: page error ${e.message}`));
  p.on("request", (r) => { if (!r.url().startsWith(origin)) fails.push(`${name}: request to another host ${r.url()}`); });
  const settle = () => p.waitForTimeout(slow ? 450 : 200);
  const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await settle(); };
  const h1 = () => p.textContent("h1");
  const shows = async (text) => (await p.evaluate(() => document.body.textContent)).includes(text);
  for (const lang of langs) {
    await p.goto(`${base}?lang=${lang}`);
    await p.evaluate(() => localStorage.clear());
    await p.goto(`${base}?lang=${lang}`);
    await p.waitForSelector("[data-welcome]");
    await p.click("[data-welcome]"); await settle();
    ok(await h1() === T(lang, "pick.title"), `${lang.toUpperCase()}: the picker asks which university`);
    for (const inst of insts) {
      const conf = institutionConfig(cfg, inst.id);
      const L = `${lang.toUpperCase()} ${inst.id}`;
      await go("#/pick");
      await p.click(`[data-uni="${inst.id}"]`); await settle();
      ok(!(await p.evaluate(() => location.hash)).startsWith("#/pick"), `${L}: picking leaves the picker`);
      // 0, 1-2 and 3-4 yes: each level points to this university's own service
      const started = Date.now();
      for (let yes = 0; yes <= total; yes++) {
        await go("#/");
        await p.click('a[href="#/check/0"]'); await settle();
        const t0 = Date.now();
        for (let i = 0; i < total; i++) { await p.click(i < yes ? '[data-answer="yes"]' : '[data-answer="no"]'); await settle(); }
        if (yes === 0) ok(Date.now() - t0 < 30000, `${L}: the four questions are answered in well under a minute (${Date.now() - t0} ms)`);
        const lv = levelFor(conf, yes);
        ok(await h1() === T(lang, `result.levels.${lv.id}.title`, {}, conf), `${L}: ${yes} yes gives "${lv.id}"`);
        const next = lv.service ? C(lang, conf.services[lv.service].name) : lv.minYes > 0 && conf.advice ? C(lang, conf.advice) : T(lang, "result.steadyNext", {}, conf);
        ok(await shows(next), `${L}: ${yes} yes points to ${lv.service ?? (lv.minYes > 0 && conf.advice ? "the general advice" : "the support list")}`);
        ok(await p.isVisible(".emergency"), `${L}: ${yes} yes shows the emergency numbers`);
      }
      ok(Date.now() - started < 120000, `${L}: five check-ins fit in two minutes`);
      await go("#/support");
      ok(await h1() === T(lang, "more.supportHeading", {}, conf), `${L}: support heading names the university`);
      if (!Object.keys(conf.services).length) ok(await shows(C(lang, conf.advice)), `${L}: without services, Support gives the general advice`);
      await supportLinks(p, ok, conf, lang, L);
      await rules(p, ok, lang, `${L} support`);
    }
  }
  await browser.close();
}

/* ---------- The config's own pages and guide (for example a partner app's view) ---------- */

async function pageFlows(name, browserType, device) {
  const browser = await browserType.launch();
  const p = await (await browser.newContext({ ...device })).newPage();
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(`${name}: ${msg}`); };
  p.on("pageerror", (e) => fails.push(`${name}: page error ${e.message}`));
  p.on("request", (r) => { if (!r.url().startsWith(origin)) fails.push(`${name}: request to another host ${r.url()}`); });
  const settle = () => p.waitForTimeout(slow ? 600 : 260);
  const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await settle(); };
  const h1 = () => p.textContent("h1");
  const ticked = () => p.$$eval(".try .num.done", (x) => x.length);
  for (const lang of langs) {
    const L = lang.toUpperCase();
    await p.goto(`${base}?lang=${lang}`);
    await p.evaluate(() => localStorage.clear());
    await p.goto(`${base}?lang=${lang}`);
    await p.waitForSelector("[data-welcome]");
    if (cfg.welcomeNote) ok((await p.evaluate(() => document.body.textContent)).includes(C(lang, cfg.welcomeNote)), `${L}: the welcome screen says what this preview is`);
    for (const pid of cfg.welcomeLinks ?? []) ok(Boolean(await p.$(`a[href="#/${pid}"]`)), `${L}: the welcome screen links to ${pid}`);
    for (const pg of cfg.pages ?? []) {
      await go(`#${pg.id}`);
      ok(await h1() === C(lang, pg.title), `${L}: #${pg.id} opens "${C(lang, pg.title)}" (got ${await h1()})`);
      await rules(p, ok, lang, `${L} page ${pg.id}`);
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${L}: page ${pg.id} fits the screen`);
      const tables = (pg.blocks ?? []).flatMap((b) => (b.table ? [b.table] : b.box ? b.box.filter((x) => x.table).map((x) => x.table) : []));
      const shown = await p.$$eval(".table-card", (cards) => cards.map((c) => ({ demo: Boolean(c.querySelector(".pill.demo")), text: c.textContent })));
      ok(shown.length === tables.length, `${L}: page ${pg.id} shows its ${tables.length} table(s)`);
      tables.forEach((tb, i) => {
        if (tb.label === "example") ok(shown[i]?.demo && shown[i].text.includes(T(lang, "demo.label")), `${L}: page ${pg.id}: made-up numbers are labelled ${T(lang, "demo.label")}`);
        else ok((shown[i]?.text ?? "").includes(C(lang, tb.note)), `${L}: page ${pg.id}: targets say they are proposed, not results`);
      });
      if (pg.frame) {
        ok(((await p.textContent(".mock-label")) ?? "").trim() === C(lang, pg.frame.label), `${L}: the mockup is labelled as one`);
        await p.click('.mock-card a[data-track="frame"]'); await settle();
        const h = await p.evaluate(() => location.hash);
        ok(h === "#/welcome" || h === "#/pick" || h === "#/", `${L}: the card's button opens the app (at ${h})`);
      }
    }
    if (lang !== langs[0]) continue;
    // The guide ticks each step once it is done, the whole way through.
    if (guide) {
      await go("#/welcome");
      await p.click("[data-welcome]"); await settle();
      await pickFirst(p, ok, settle);
      await go("#/");
      await p.click('a[href="#/check/0"]'); await settle();
      for (let i = 0; i < total; i++) { await p.click('[data-answer="no"]'); await settle(); }
      await go("#/results"); await go("#/support");
      await go("#/about");
      ok(await ticked() === guide.length, `${L}: every step of the guide is ticked after doing it (${await ticked()} of ${guide.length})`);
      ok((await p.evaluate(() => document.body.textContent)).includes(T(lang, "about.allDone")), `${L}: the guide says everything was tried`);
      await p.click('[data-delete="ask"]'); await settle();
      await p.click('[data-delete="yes"]'); await settle();
      await p.click("[data-welcome]"); await settle();
      await pickFirst(p, ok, settle);
      await go("#/about");
      ok(await ticked() === afterStartOver, `${L}: Start over resets the guide`);
    }
  }
  await browser.close();
}

/** The built files never misspell the team's names (local runs, where dist/ is at hand). */
function buildText() {
  if (live) return;
  const files = [];
  const walk = (d) => readdirSync(d).forEach((n) => { const f = path.join(d, n); if (statSync(f).isDirectory()) walk(f); else if (/\.(html|js|json|css|webmanifest|svg)$/.test(n)) files.push(f); });
  walk(path.join(dist, folder));
  const bad = files.filter((f) => /Braun\b|Braün/.test(readFileSync(f, "utf8")));
  checks++;
  if (bad.length) fails.push(`build: "Braun" or "Braün" in ${bad.map((f) => path.relative(dist, f)).join(", ")}`);
}

async function desktop() {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(`desktop: ${msg}`); };
  p.on("pageerror", (e) => fails.push(`desktop: page error ${e.message}`));
  await p.goto(`${base}?lang=en`);
  await p.waitForSelector("[data-welcome]");
  if (cfg.publicUrl) {
    ok((await p.textContent("body")).includes(T("en", "install.desktopTitle")), "a computer gets the phone link");
    // Over a real network the image arrives a moment after the page: wait for it.
    if (cfg.qr) ok(await until(p, () => { const i = document.querySelector(".qr"); return Boolean(i && i.complete && i.naturalWidth > 0); }, null, 8000), "the QR code loads");
  } else {
    ok(!(await p.$(".install")), "no install help without a public address");
  }
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "fits the window");
  await browser.close();
}

async function offline() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const p = await context.newPage();
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(`offline: ${msg}`); };
  await p.goto(`${base}?lang=en`);
  ok(await until(p, () => !!navigator.serviceWorker.controller, null, 8000) || (await p.reload(), await until(p, () => !!navigator.serviceWorker.controller, null, 8000)), "the offline copy is installed");
  await context.setOffline(true);
  await p.reload();
  ok(await until(p, () => !!document.querySelector("h1")), "opens without a connection");
  await browser.close();
}

console.log(`Testing "${uniId}" at ${base}`);
const runs = [
  ["iPhone SE", () => phone("iPhone SE", webkit, devices["iPhone SE"], "ios")],
  ["iPhone 14", () => phone("iPhone 14", webkit, devices["iPhone 14"], "ios")],
  ["Pixel 7", () => phone("Pixel 7", chromium, devices["Pixel 7"], "android")],
  ["iPhone 14, every result in each language", () => languageFlows("iPhone 14 (each language)", webkit, devices["iPhone 14"])],
  ["Pixel 7, every result in each language", () => languageFlows("Pixel 7 (each language)", chromium, devices["Pixel 7"])],
  ...(insts.length ? [["Pixel 7, every university in each language", () => institutionFlows("Pixel 7 (each university)", chromium, devices["Pixel 7"])]] : []),
  ...(cfg.pages?.length ? [["iPhone SE, the config's pages", () => pageFlows("iPhone SE (pages)", webkit, devices["iPhone SE"])]] : []),
  ["build", buildText],
  ["desktop", desktop],
  ["offline", offline],
];
try {
  for (const [name, run] of runs) {
    try { await run(); } catch (e) { fails.push(`${name}: stopped: ${String(e.message ?? e).split("\n")[0]}`); }
  }
} finally {
  if (!live) server.close();
}
console.log(`${checks} checks`);
if (fails.length) { fails.forEach(annotate); console.error(fails.join("\n")); process.exit(1); }
console.log("all pass");
