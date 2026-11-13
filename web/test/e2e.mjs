// End-to-end check of the reviewer preview in real browser engines: WebKit (iPhone
// SE, iPhone 14) and Chromium (Pixel 7, a desktop window). It serves dist/ itself,
// or checks a deployed copy when E2E_URL is set.
//
//   npm run build && npm run e2e
//   E2E_URL=https://cc.braunf.com/epfl/ npm run e2e      # after deploying
//
// Needs Playwright, which the app itself does not use. Install it once, outside the
// project's dependencies:  npm i --no-save playwright && npx playwright install webkit chromium
import http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pw;
try { pw = await import("playwright"); } catch {
  console.error("Playwright is not installed. Run: npm i --no-save playwright && npx playwright install webkit chromium");
  process.exit(2);
}
const { webkit, chromium, devices } = pw;

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const live = process.env.E2E_URL;
if (!live && !existsSync(path.join(dist, "epfl", "index.html"))) { console.error("Run npm run build first."); process.exit(2); }

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
const base = live ?? `http://localhost:${server.address().port}/epfl/`;
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

async function phone(name, browserType, device) {
  const browser = await browserType.launch();
  const context = await browser.newContext({ ...device });
  const p = await context.newPage();
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(`${name}: ${msg}`); };
  p.on("pageerror", (e) => fails.push(`${name}: page error ${e.message}`));
  p.on("request", (r) => { if (!r.url().startsWith(origin)) fails.push(`${name}: request to another host ${r.url()}`); });
  const settle = () => p.waitForTimeout(260);
  const h1 = () => p.textContent("h1");
  const hash = () => p.evaluate(() => location.hash);
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
  ok(await h1() === "Welcome", "the welcome screen comes first");
  ok((await p.$$("#nav a")).length === 0, "no tabs on the welcome screen");
  ok(!(await p.$(".preview-strip")), "no preview line on the welcome screen");
  ok((await p.$$(".install .steps li")).length === 4, "four install steps");
  await fits("welcome");
  await p.click("#lang-toggle"); await settle();
  ok(await h1() === "Bienvenue", "language switch on the welcome screen");
  await p.click("#lang-toggle"); await settle();
  await p.click("[data-welcome]"); await settle();
  ok((await p.$$("#nav a")).length === 4, "four tabs after Start");
  ok(await p.isVisible(".preview-strip"), "preview line on Home");
  await fits("home");

  // Difficult week, then the check-in with a double tap, a skip and the back button
  await staysPut('[data-scenario="heavy"]', "signals", "choosing an example week");
  await p.evaluate(() => scrollTo(0, 0));
  await p.click('a[href="#/check/0"]'); await settle();
  ok(!(await p.$(".preview-strip")), "no preview line during the check-in");
  ok(/sleep/i.test(await p.textContent("#q")), "sleep comes first in a difficult week");
  ok(await p.isVisible("text=Your phone noticed"), "the phone hint is shown");
  await fits("question");
  await p.click('[data-answer="yes"]'); await p.click('[data-answer="yes"]', { force: true }); await settle(); await settle();
  ok(await hash() === "#/check/1", `a double tap answers one question only (at ${await hash()})`);
  ok(/started/i.test(await p.textContent("#q")), "getting started comes second (steps are low)");
  await answer("no");
  ok(await p.isVisible("text=No phone signal for this one"), "questions without a signal say so");
  await answer("skip");
  await answer("yes");
  ok(await h1() === "A few signs are showing up", `two yes answers, one skipped (got ${await h1()})`);
  ok(await p.isVisible("text=Questions skipped: 1 of 4."), "skipped questions are counted");
  ok(await p.isVisible("text=What your phone noticed"), "the result shows what the phone noticed");
  ok(await p.isVisible("text=Social consultation"), "two signs point to the social consultation");
  await fits("result");
  await p.goBack(); await settle();
  ok(!(await hash()).startsWith("#/check"), `the back button leaves the finished check-in (at ${await hash()})`);
  await p.evaluate(() => { location.hash = "#/check/2"; }); await settle();
  ok(await hash() === "#/check/0", "a check-in never starts in the middle");

  // A calm week: nothing unusual, and the result keeps the week it was done with
  await p.evaluate(() => { location.hash = "#/"; }); await settle();
  await p.click('[data-scenario="steady"]'); await settle();
  await p.click('a[href="#/check/0"]'); await settle();
  ok(await p.isVisible("text=Your phone noticed nothing unusual"), "a calm week says nothing unusual");
  for (let i = 0; i < 4; i++) await answer("no");
  ok(await h1() === "Things look steady this week", "four no answers are steady");
  await p.evaluate(() => { location.hash = "#/"; }); await settle();
  await p.click('[data-scenario="heavy"]'); await settle();
  await p.click('a[href^="#/result/"]'); await settle();
  ok(await p.isVisible("text=Nothing unusual in sleep"), "a result keeps the example week it was done with");

  // My weeks
  await p.click('#nav a[href="#/history"]'); await settle();
  ok((await p.$$(".week-list li")).length === 7, "one own week and six examples");
  ok((await p.$$(".chart .col")).length <= 7, "the chart fits seven weeks at most");
  await fits("my weeks");

  // Support
  await p.click('#nav a[href="#/support"]'); await settle();
  ok((await p.$$(".service")).length === 2 && await p.isVisible(".emergency"), "services and emergency numbers");
  await fits("support");

  // About, every result, privacy, feedback
  await p.click('#nav a[href="#/about"]'); await settle();
  ok((await p.$$(".try li")).length === 5, "five things to try");
  const mail = await p.getAttribute('.try a[href^="mailto:"]', "href");
  ok(/^mailto:contact@calm\.braunf\.com\?subject=.+&body=.+/.test(mail ?? ""), "feedback opens a prepared email");
  await fits("about");
  await p.click('.try a[href="#/results"]'); await settle();
  const list = await p.textContent(".level-list");
  for (const s of ["Yes answers: 0 of 4", "Yes answers: 1 of 4", "Yes answers: 2 of 4", "Yes answers: 3–4 of 4", "the list of support options", "Psychotherapeutic consultation (CHUV)"]) ok(list.includes(s), `every result lists "${s}"`);
  ok(await p.isVisible("text=Every result also shows the emergency numbers."), "emergency note on every result");
  await p.click('a[href="#/preview/care"]'); await settle();
  ok(await p.isVisible("text=Example result"), "example results are labelled");
  await p.click('a.btn.sm[href="#/results"]'); await settle();
  await p.click('a.btn.sm[href="#/about"]'); await settle();
  await staysPut('[data-lang="fr"]', "lang", "switching to French");
  ok(await p.evaluate(() => document.documentElement.lang) === "fr", "the page language follows");
  await staysPut('[data-lang="en"]', "lang", "switching to English");
  await p.locator('a[href="#/privacy"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
  const y = await p.evaluate(() => Math.round(scrollY));
  await p.click('a[href="#/privacy"]'); await settle();
  await p.click('a.btn.sm[href="#/about"]'); await settle();
  ok(Math.abs(await p.evaluate(() => Math.round(scrollY)) - y) < 3, "back from privacy lands where you were");

  // French typography
  await p.click('[data-lang="fr"]'); await settle();
  await p.evaluate(() => { location.hash = "#/"; }); await settle();
  await p.click('a[href="#/check/0"]'); await settle();
  ok((await p.textContent("#q")).endsWith("\u202f?"), "French questions keep the question mark with the last word");
  await p.evaluate(() => { location.hash = "#/support"; }); await settle();
  ok(await h1() === "Soutien à l\u2019EPFL", `French uses the article with the name (got ${await h1()})`);
  await p.click('#lang-toggle'); await settle();

  // Start over
  await p.evaluate(() => { location.hash = "#/about"; }); await settle();
  await staysPut('[data-delete="ask"]', "delete", "asking to start over");
  await staysPut('[data-delete="no"]', "delete", "cancelling start over");
  await p.click('[data-delete="ask"]'); await settle();
  await p.click('[data-delete="yes"]'); await settle();
  ok(await h1() === "Welcome", "start over shows the welcome screen");
  await p.click("[data-welcome]"); await settle();
  await p.click('#nav a[href="#/history"]'); await settle();
  ok((await p.$$(".week-list li")).length === 6, "start over keeps only the examples");

  await browser.close();
}

async function desktop() {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const ok = (cond, msg) => { checks++; if (!cond) fails.push(`desktop: ${msg}`); };
  p.on("pageerror", (e) => fails.push(`desktop: page error ${e.message}`));
  await p.goto(`${base}?lang=en`);
  await p.waitForSelector("[data-welcome]");
  ok(await p.isVisible("text=Made for phones"), "a computer gets the phone link");
  ok(await p.evaluate(() => document.querySelector(".qr")?.naturalWidth > 0), "the QR code loads");
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

try {
  await phone("iPhone SE", webkit, devices["iPhone SE"]);
  await phone("iPhone 14", webkit, devices["iPhone 14"]);
  await phone("Pixel 7", chromium, devices["Pixel 7"]);
  await desktop();
  await offline();
} finally {
  if (!live) server.close();
}
console.log(`${checks} checks`);
if (fails.length) { console.error(fails.join("\n")); process.exit(1); }
console.log("all pass");
