// End-to-end check of the reviewer preview in real browser engines: WebKit (iPhone
// SE, iPhone 14) and Chromium (Pixel 7, a desktop window), plus offline use.
// It serves dist/ itself, or checks a deployed copy when E2E_URL is set.
//
//   npm run build && npm run e2e
//   E2E_URL=https://cc.braunf.com/epfl/ npm run e2e      # after deploying
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
const ui = { en: json("src/i18n/en.json"), fr: json("src/i18n/fr.json") };
const hasFr = cfg.languages.includes("fr");
const nameIn = (lang) => (cfg.nameInText ? loc(cfg.nameInText, lang, cfg.defaultLanguage) : cfg.name);
const T = (lang, key, vars = {}) => typography(translate(ui[lang], key, { name: nameIn(lang), ...vars }), lang);
const C = (lang, value) => typography(loc(value, lang, cfg.defaultLanguage), lang);
const tryTitle = (i) => typography(ui.en.about.try[i].h, "en");
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

async function until(page, fn, arg, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg)) return true;
    await page.waitForTimeout(40);
  }
  return false;
}

/* ---------- A reviewer's whole journey on a phone ---------- */

async function phone(name, browserType, device, os) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ ...device });
  const p = await context.newPage();
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(`${name}: ${msg}`); };
  p.on("pageerror", (e) => fails.push(`${name}: page error ${e.message}`));
  p.on("request", (r) => { if (!r.url().startsWith(origin)) fails.push(`${name}: request to another host ${r.url()}`); });
  const settle = () => p.waitForTimeout(260);
  const h1 = () => p.textContent("h1");
  const hash = () => p.evaluate(() => location.hash);
  const shows = async (text) => (await p.evaluate(() => document.body.textContent)).includes(text);
  const go = async (h) => { await p.evaluate((x) => { location.hash = x; }, h); await settle(); };
  const fits = async (where) => ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `wider than the screen on ${where}`);
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
  ok(await shows(T("en", "welcome.lead")), "the welcome screen says what CalmCampus is");
  ok((await p.$$("#nav a")).length === 0, "no tabs on the welcome screen");
  ok(!(await p.$(".preview-strip")), "no preview line on the welcome screen");
  ok((await p.$$(".install .steps li")).length === ui.en.install[os].length, "numbered install steps for this phone");
  await fits("welcome");
  if (hasFr) {
    await p.click("#lang-toggle"); await settle();
    ok(await h1() === T("fr", "welcome.title"), "language switch on the welcome screen");
    await p.click("#lang-toggle"); await settle();
  }
  await p.click("[data-welcome]"); await settle();
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
  const level = levelFor(cfg, 2);
  ok(await h1() === T("en", `result.levels.${level.id}.title`), `two yes answers and one skip give "${level.id}" (got ${await h1()})`);
  ok(await shows(T("en", "result.skipped", { n: 1, total })), "skipped questions are counted");
  ok(await shows(T("en", "signals.resultHeading")), "the result shows what the phone noticed");
  ok(await shows(level.service ? C("en", cfg.services[level.service].name) : T("en", "result.seeSupport")), "the result points to the configured next step");
  ok(((await p.textContent(".next-try")) ?? "").includes(tryTitle(1)), "the result suggests the next thing to try");
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
  ok((await p.$$(".service")).length === Object.keys(cfg.services).length && await p.isVisible(".emergency"), "services and emergency numbers");
  await fits("support");

  // About: the guide, every result, feedback, language, privacy
  await p.click('#nav a[href="#/about"]'); await settle();
  ok((await p.$$(".try li")).length === ui.en.about.try.length, "the guide lists every thing to try");
  ok((await p.$$(".try .num.done")).length === 3 && await shows(T("en", "about.progress", { n: 3, total: 5 })), "the guide shows what was tried (check-in, another week, support)");
  const mail = await p.getAttribute('.try a[href^="mailto:"]', "href");
  ok((mail ?? "").startsWith(`mailto:${cfg.feedback.email}?subject=`) && (mail ?? "").includes("&body="), "feedback opens a prepared email");
  await fits("about");
  await p.click('.try a[href="#/results"]'); await settle();
  const list = await p.textContent(".level-list");
  for (const { level: lv, lo, hi } of levelRanges(cfg)) {
    const range = lo === hi ? `${lo}` : `${lo}–${hi}`;
    const target = lv.service ? C("en", cfg.services[lv.service].name) : T("en", "results.supportList");
    ok(list.includes(T("en", "results.yes", { range, total })) && list.includes(T("en", "results.suggests", { target })), `every result lists "${lv.id}" with its range and next step`);
  }
  ok(await shows(T("en", "results.emergencyNote")), "emergency note on every result");
  const top = levelRanges(cfg).at(-1).level.id;
  await p.click(`a[href="#/preview/${top}"]`); await settle();
  ok(await shows(T("en", "result.exampleKicker")), "example results are labelled");
  await p.click('a.btn.sm[href="#/results"]'); await settle();
  await p.click('a.btn.sm[href="#/about"]'); await settle();
  ok((await p.$$(".try .num.done")).length === 4, "seeing every result counts as tried");
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
    await p.click("#lang-toggle"); await settle();
  }

  // Start over
  await go("#/about");
  await staysPut('[data-delete="ask"]', "delete", "asking to start over");
  await staysPut('[data-delete="no"]', "delete", "cancelling start over");
  await p.click('[data-delete="ask"]'); await settle();
  await p.click('[data-delete="yes"]'); await settle();
  ok(await h1() === T("en", "welcome.title"), "start over shows the welcome screen");
  await p.click("[data-welcome]"); await settle();
  await p.click('#nav a[href="#/history"]'); await settle();
  ok((await p.$$(".week-list li")).length === 6, "start over keeps only the examples");
  await p.click('#nav a[href="#/about"]'); await settle();
  ok((await p.$$(".try .num.done")).length === 0, "start over resets the guide");

  await browser.close();
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
    if (cfg.qr) ok(await p.evaluate(() => document.querySelector(".qr")?.naturalWidth > 0), "the QR code loads");
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
try {
  await phone("iPhone SE", webkit, devices["iPhone SE"], "ios");
  await phone("iPhone 14", webkit, devices["iPhone 14"], "ios");
  await phone("Pixel 7", chromium, devices["Pixel 7"], "android");
  await desktop();
  await offline();
} finally {
  if (!live) server.close();
}
console.log(`${checks} checks`);
if (fails.length) { console.error(fails.join("\n")); process.exit(1); }
console.log("all pass");
