import { icon } from "./lib/icons.js";
import { loadConfig, resolveUniversityId } from "./lib/config.js";
import { loc, pickLanguage, translate, typography } from "./lib/i18n.js";
import { resultFor, answersForLevel, levelRanges } from "./lib/scoring.js";
import { createStore } from "./lib/store.js";
import { demoEntries } from "./lib/demo.js";
import { isoDate, weekKey, weekStart } from "./lib/week.js";
import { SCENARIO_IDS, DEFAULT_SCENARIO, weekSignals, signalsFor, orderQuestions } from "./lib/signals.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const app = { config: null, store: null, lang: "en", ui: {}, answers: {}, confirmDelete: false, deleted: false, fellBack: false, screen: null, tabScroll: {}, advancing: false };
const TABS = new Set(["home", "history", "support", "about"]);

/** Display text goes through typography(); links never do (L keeps them raw). */
const typo = (s) => typography(s, app.lang);
const L = (value) => loc(value, app.lang, app.config.defaultLanguage);
const Lt = (value) => typo(L(value));
/** The university's name inside a sentence, with its article where needed (config `nameInText`). */
const uniName = () => (app.config?.nameInText ? L(app.config.nameInText) : app.config?.name);
const t = (key, vars) => typo(translate(app.ui, key, { name: uniName(), ...vars }));

/**
 * Preview builds (a reviewer demo, `preview: true` in the university config) always
 * show the example weeks and example phone data, so a reviewer never has to find a
 * setting. Their own answers are saved next to the examples and kept apart from
 * them (examples carry `demo: true` and are labelled Example).
 */
const isPreview = () => app.config?.preview === true;
const showsExamples = () => app.store.isDemo();

async function loadUi(lang) {
  const res = await fetch(`i18n/${lang}.json`);
  if (!res.ok) throw new Error(`i18n ${lang}`);
  return res.json();
}

const isInstalled = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
function platform() {
  const ua = navigator.userAgent;
  // iPadOS Safari presents itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return /Android/.test(ua) ? "android" : "desktop";
}

/* ---------- Shell ---------- */

function renderShell() {
  const c = app.config;
  const chip = c.logo?.image
    ? `<span class="uni-chip"><img src="${esc(c.logo.image)}" alt="${esc(c.name)}"></span>`
    : c.logo?.text ? `<span class="uni-chip">${esc(c.logo.text)}</span>` : "";
  const other = c.languages.length > 1 ? c.languages.find((l) => l !== app.lang) : null;
  const switcher = other
    ? `<button class="lang" id="lang-toggle" lang="${other}" aria-label="${esc(t("lang.switchTo"))}">${icon("languages", 18)}${esc(other.toUpperCase())}</button>`
    : "";
  $("top").innerHTML = `<div class="brand"><a class="wordmark" href="#/">CalmCampus</a>${chip}</div>${switcher}`;
  $("lang-toggle")?.addEventListener("click", () => setLang(other));
  $("disclaimer").textContent = t("disclaimer");
  document.documentElement.lang = app.lang;

  if (isPreview()) {
    // Hidden on the welcome screen and during the check-in, where the screen needs the room.
    $("demo-banner").innerHTML = app.screen === "welcome" || app.screen === "check" ? ""
      : `<a class="preview-strip" href="#/about">${icon("info", 18)}<span class="grow">${esc(t("preview.strip"))}</span><span class="go">${esc(t("preview.tryLink"))}</span></a>`;
  } else {
    $("demo-banner").innerHTML = showsExamples()
      ? `<div class="demo-banner" role="status">${icon("flask-conical", 18)}<span><strong>${esc(t("demo.label"))}.</strong> ${esc(t("demo.banner"))}</span><button id="demo-exit">${esc(t("demo.exit"))}</button></div>`
      : "";
    $("demo-exit")?.addEventListener("click", () => {
      app.store.setDemo(false);
      renderShell();
      if (location.hash && location.hash !== "#/") location.hash = "#/"; else route();
    });
  }
}

function renderNav(active) {
  if (!active) { $("nav").innerHTML = ""; return; }
  const items = [["home", "house", "#/"], ["history", "chart-no-axes-column", "#/history"], ["support", "life-buoy", "#/support"], ["about", "info", "#/about"]];
  $("nav").setAttribute("aria-label", t("nav.label"));
  $("nav").innerHTML = items
    .map(([id, ic, href]) => `<a href="${href}" ${id === active ? 'aria-current="page"' : ""}>${icon(ic, 22)}<span>${esc(t(`nav.${id}`))}</span></a>`)
    .join("");
}

function syncDock() {
  const h = $("dock").offsetHeight;
  document.documentElement.style.setProperty("--dock-h", `${h}px`);
}

async function setLang(lang, fromEl = null, focusSel = null) {
  app.lang = lang;
  app.store.setLang(lang);
  app.ui = await loadUi(lang);
  refresh(fromEl, focusSel, renderShell);
}

/* ---------- Small pieces ---------- */

const currentWeek = () => weekKey(new Date());

function pillFor(level) {
  return `<span class="pill ${esc(level.id)}">${esc(t(`result.levels.${level.id}.pill`))}</span>`;
}

function exampleTag() {
  return showsExamples() ? `<span class="pill demo">${esc(t("demo.label"))}</span>` : "";
}

/** `replace`: go back without adding a browser history entry (used inside the check-in). */
function backLink(href, label, replace = false) {
  return `<a class="btn ghost sm" href="${href}"${replace ? " data-replace" : ""}>${icon("arrow-left", 18)}${esc(label)}</a>`;
}

function feedbackHref() {
  const fb = app.config.feedback;
  const subject = typeof fb.subject === "string" ? fb.subject : L(fb.subject);
  // A few neutral prompts help a reviewer start; nothing from the app is added.
  const body = t("more.feedbackTemplate").replace(/\n/g, "\r\n");
  return `mailto:${fb.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function langButtons(keep) {
  const c = app.config;
  if (c.languages.length < 2) return "";
  return `<div class="seg" data-keep="${keep}" role="group" aria-label="${esc(t("more.languageHeading"))}">${c.languages.map((l) =>
    `<button class="btn ${l === app.lang ? "sage" : "ghost"} sm" data-lang="${l}" lang="${l}" aria-pressed="${l === app.lang}">${esc(app.ui.lang.names?.[l] ?? l.toUpperCase())}</button>`).join("")}</div>`;
}

/**
 * How to get the app onto the home screen: numbered steps on a phone, and on a
 * computer (where the email is often opened first) a QR code to the phone link.
 */
function installTip() {
  if (isInstalled()) return "";
  const p = platform();
  if (p === "desktop") {
    const url = app.config.publicUrl;
    if (!url) return "";
    const shown = url.replace(/^https:\/\//, "").replace(/\/$/, "");
    const qr = app.config.qr ? `<img class="qr" src="${esc(app.config.qr)}" width="132" height="132" alt="${esc(t("install.qrAlt", { url: shown }))}">` : "";
    return `<div class="card install desktop">${qr}<div class="grow"><h3>${esc(t("install.desktopTitle"))}</h3><p>${esc(t("install.desktopBody", { url: shown }))}</p></div></div>`;
  }
  const steps = app.ui.install[p].map((s) => `<li>${esc(typo(s))}</li>`).join("");
  return `<div class="card stack install"><h3 class="row">${icon("share", 20)}${esc(t("install.title"))}</h3><ol class="steps">${steps}</ol></div>`;
}

/* ---------- The reviewer's guide ("Things to try") ---------- */

// One entry per item of `about.try` in the strings, in the same order.
const TRIES = ["checkin", "week", "results", "support", "feedback"];
const tryHref = (id) => ({ checkin: "#/check/0", week: "#/", results: "#/results", support: "#/support", feedback: feedbackHref() }[id]);

/** Which items are done. "week" needs check-ins with two different example weeks. */
function triedDone() {
  const tried = app.store.tried();
  const weeks = tried.filter((x) => x.startsWith("scenario:")).length;
  return new Set(TRIES.filter((id) => (id === "week" ? weeks >= 2 : tried.includes(id))));
}

function tryLink(id, inner, cls = "") {
  const attrs = id === "checkin" ? " data-reset" : id === "feedback" ? ' data-track="feedback"' : "";
  return `<a${cls ? ` class="${cls}"` : ""} href="${esc(tryHref(id))}"${attrs}>${inner}</a>`;
}

/** On a result: point to the next thing to try, so a reviewer never wonders what to do next. */
function nextTryCard() {
  if (!isPreview()) return "";
  const done = triedDone();
  const i = TRIES.findIndex((id) => id !== "checkin" && !done.has(id));
  if (i === -1) return "";
  const it = app.ui.about.try[i];
  return tryLink(TRIES[i], `<span class="grow"><span class="small">${esc(t("result.nextTry"))}</span><br><strong>${esc(typo(it.h))}</strong></span>${icon("arrow-right", 20)}`, "next-try");
}

/* ---------- Example phone data (see lib/signals.js) ---------- */

function scenario() {
  const s = app.store.getScenario();
  return SCENARIO_IDS.includes(s) ? s : DEFAULT_SCENARIO;
}
const phoneSignals = () => (showsExamples() ? weekSignals(scenario()) : null);
const questionsInOrder = () => orderQuestions(app.config.questions, phoneSignals());

function fmtSignal(id, v) {
  if (id === "sleep") {
    let h = Math.floor(v), m = Math.round((v - h) * 6) * 10;
    if (m === 60) { h += 1; m = 0; }
    return t("signals.hours", { h, m: app.lang === "fr" ? String(m).padStart(2, "0") : m });
  }
  if (id === "lateScreen") return t("signals.minutes", { m: Math.round(v / 5) * 5 });
  return (Math.round(v / 100) * 100).toLocaleString(app.lang);
}

const signalHint = (s) => t(`signals.hint.${s.id}`, { value: fmtSignal(s.id, s.mean), usual: fmtSignal(s.id, s.usual) });

function signalsCard(entry) {
  const sigs = phoneSignals();
  if (!sigs) return "";
  const cur = scenario();
  const redo = entry && entry.scenario && entry.scenario !== cur
    ? `<div class="redo"><p class="small">${esc(t("signals.redoPrompt"))}</p><a class="btn sage sm" href="#/check/0" data-reset>${esc(t("home.redo"))}${icon("arrow-right", 18)}</a></div>`
    : "";
  const rows = sigs.map((s) => {
    const status = s.notable ? s.direction : "same";
    return `<li class="sig${s.notable ? " notable" : ""}">
      <div class="sig-top"><strong>${esc(t(`signals.names.${s.id}`))}</strong>
        <span class="pill ${s.notable ? "notice" : "steady"}">${esc(t(`signals.status.${status}`))}</span></div>
      <p class="small">${esc(fmtSignal(s.id, s.mean))} ${esc(t(`signals.per.${s.id}`))}, <span class="nowrap">${esc(t("signals.usual", { value: fmtSignal(s.id, s.usual) }))}</span></p></li>`;
  }).join("");
  const seg = `<div class="scen" role="group" aria-label="${esc(t("signals.scenarioLabel"))}">${SCENARIO_IDS.map((id) =>
    `<button class="btn ${id === cur ? "sage" : "ghost"}" data-scenario="${id}" aria-pressed="${id === cur}">${esc(t(`signals.scenarios.${id}`))}</button>`).join("")}</div>`;
  return `<section class="card stack signals" data-keep="signals" aria-labelledby="sig-h">
    <div class="row wrap"><h2 id="sig-h" class="grow">${esc(t("signals.heading"))}</h2>${exampleTag()}</div>
    <p class="small">${esc(t("signals.simulated"))}</p>
    <ul class="sig-list">${rows}</ul>
    <div class="scen-box"><p><strong>${esc(t("signals.scenarioLabel"))}</strong></p><p class="small">${esc(t("signals.scenarioHint"))}</p>${seg}${redo}</div>
  </section>`;
}

function checkContext(q) {
  const sigs = phoneSignals();
  if (!sigs) return "";
  const hits = signalsFor(q, sigs);
  if (hits.length) {
    return `<div class="hint"><div class="row wrap"><strong class="row grow">${icon("smartphone", 18)}${esc(t("signals.noticedHeading"))}</strong>${exampleTag()}</div>
      ${hits.map((s) => `<p>${esc(signalHint(s))}</p>`).join("")}
      <p class="you">${esc(t("signals.youDecide"))}</p></div>`;
  }
  // Questions with a phone signal that looks as usual say so, so the adaptation stays visible.
  const note = q.signals?.length ? "signals.unremarkable" : "signals.noSignal";
  return `<p class="small row">${icon("smartphone", 18)}<span>${esc(t(note))}</span></p>`;
}

/** What the phone noticed for a result: the example week the check-in was done with. */
function phoneSection(scenarioId) {
  if (!showsExamples()) return "";
  const sigs = weekSignals(SCENARIO_IDS.includes(scenarioId) ? scenarioId : scenario());
  const hits = sigs.filter((s) => s.notable);
  return `<div class="card stack"><div class="row wrap"><h3 class="grow">${esc(t("signals.resultHeading"))}</h3>${exampleTag()}</div>
    ${hits.length
      ? `<ul class="noticed">${hits.map((s) => `<li>${icon("smartphone", 18)}<span>${esc(signalHint(s))}</span></li>`).join("")}</ul>`
      : `<p>${esc(t("signals.resultNone"))}</p>`}
    <p class="small">${esc(t("signals.resultNote"))}</p></div>`;
}

/* ---------- Screens ---------- */

function viewWelcome() {
  const icons = ["check", "smartphone", "shield-check"];
  const points = app.ui.welcome.points.map((p, i) => `<li><span class="dot">${icon(icons[i] ?? "check", 20)}</span><span>${esc(typo(p.replace(/\{name\}/g, uniName())))}</span></li>`).join("");
  return `<div class="stack welcome">
    <h1>${esc(t("welcome.title"))}</h1>
    <p class="lead">${esc(t("welcome.lead"))}</p>
    <ul class="points">${points}</ul>
    ${installTip()}
    <p class="small">${esc(t("welcome.later"))}</p>
  </div>`;
}

function viewHome() {
  const entry = app.store.entryForWeek(currentWeek());
  const done = entry
    ? `<div class="card stack"><h2>${icon("check", 22)} ${esc(t("home.doneTitle"))}</h2><p class="lead">${esc(t("home.doneBody"))}</p>
        <a class="btn sage" href="#/result/${esc(entry.week)}">${esc(t("home.viewResult"))}</a>
        <a class="btn ghost" href="#/check/0" data-reset>${esc(t("home.redo"))}</a></div>`
    : `<a class="btn" href="#/check/0" data-reset>${esc(t("home.start"))}${icon("arrow-right", 20)}</a>`;
  return `<div class="stack">
    ${app.fellBack ? `<p class="card small" role="status">${esc(t("errors.config"))}</p>` : ""}
    <div><p class="small">${esc(t("home.greeting"))}</p><h1>${esc(t("home.title"))}</h1></div>
    ${done}
    ${entry ? "" : `<p class="lead">${esc(t("home.lead"))}</p>`}
    ${signalsCard(entry)}
    <p class="small row">${icon("shield-check", 18)}<span>${esc(t("home.stays"))}</span></p>
  </div>`;
}

const checkIndex = () => { const m = location.hash.match(/^#\/check\/(\d+)$/); return m ? Number(m[1]) : -1; };

/** Returns null when it redirects, so route() stops there. */
function viewCheck(n) {
  const qs = questionsInOrder();
  if (!(n >= 0 && n < qs.length)) { location.replace("#/"); return null; }
  // Never show a question before the earlier ones are answered, for example after the
  // browser's back button returns into a check-in that is already finished.
  const missing = qs.findIndex((q, i) => i < n && app.answers[q.id] === undefined);
  if (missing !== -1) { location.replace(`#/check/${missing}`); return null; }
  const q = qs[n];
  const dots = qs.map((_, i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("");
  return `<div class="stack">
    <div class="row">${backLink(n === 0 ? "#/" : `#/check/${n - 1}`, t("checkin.back"), true)}
      <span class="small grow" style="text-align:right">${esc(t("checkin.progress", { n: n + 1, total: qs.length }))}</span></div>
    <div class="progress" aria-hidden="true">${dots}</div>
    <p class="small">${esc(t("checkin.heading"))}</p>
    <h1 class="question" id="q">${esc(Lt(q.text))}</h1>
    ${checkContext(q)}</div>`;
}

/** Yes, No and Skip sit in the bottom dock during the check-in, so they are always in reach. */
function checkAnswers(n) {
  const q = questionsInOrder()[n];
  if (!q) return "";
  const picked = app.answers[q.id];
  return `<div class="answers" role="group" aria-labelledby="q">
      <button class="btn ${picked === true ? "picked" : ""}" data-answer="yes" data-n="${n}">${esc(t("checkin.yes"))}</button>
      <button class="btn ${picked === false ? "picked" : ""}" data-answer="no" data-n="${n}">${esc(t("checkin.no"))}</button>
      <button class="btn link" data-answer="skip" data-n="${n}">${esc(t("checkin.skip"))}</button>
    </div>`;
}

function serviceCard(id, { actions = true } = {}) {
  const s = app.config.services[id];
  if (!s) return "";
  const c = s.contact || {};
  const link = L(c.link), hours = Lt(c.hours), note = Lt(s.note);
  const btns = [];
  if (c.email) btns.push({ href: `mailto:${c.email}`, label: t("service.email"), ic: "mail", ext: false });
  if (link) btns.push({ href: link, label: t("service.website"), ic: "external-link", ext: true });
  if (c.phone) btns.push({ href: `tel:${c.phone.replace(/\s/g, "")}`, label: `${t("service.call")} ${c.phone}`, ic: "phone", ext: false });
  const buttons = actions && btns.length
    ? `<div class="actions">${btns.map((b, i) => `<a class="btn ${i ? "ghost" : ""}" href="${esc(b.href)}" ${b.ext ? 'target="_blank" rel="noopener noreferrer"' : ""}>${icon(b.ic, 20)}${esc(b.label)}</a>`).join("")}</div>`
    : "";
  return `<section class="card service" aria-labelledby="s-${esc(id)}">
    <h3 id="s-${esc(id)}">${esc(Lt(s.name))}</h3>
    <p>${esc(Lt(s.purpose))}</p>
    ${note ? `<p class="small">${esc(note)}</p>` : ""}
    ${btns.length ? "" : `<p class="small">${esc(t("service.noContact"))}</p>`}
    ${buttons}
    ${hours ? `<p class="meta">${icon("clock", 16)} ${esc(hours)}</p>` : ""}
    ${c.email && actions ? `<p class="small" style="margin-top:8px">${esc(t("service.emailNote"))}</p>` : ""}
  </section>`;
}

function emergencyCard() {
  const items = app.config.emergency.map((e) => `<div class="em-item">
      <div class="label">${esc(Lt(e.label))}</div>
      <a class="call" href="tel:${esc(e.tel)}">${icon("phone", 22)}${esc(typo(e.number))}</a>
      <div class="detail">${esc(Lt(e.detail))}</div></div>`).join("");
  return `<section class="emergency" aria-labelledby="em-h">
    <h2 id="em-h">${icon("siren", 24)}${esc(t("result.emergencyHeading"))}</h2>
    <p class="intro">${esc(t("result.emergencyIntro"))}</p>${items}</section>`;
}

function viewResult(answers, { saved, example, phone, scenarioId, back } = {}) {
  const c = app.config;
  const r = resultFor(c, answers);
  const yesQs = c.questions.filter((q) => answers[q.id] === true);
  const skipped = c.questions.filter((q) => answers[q.id] === null).length;
  const lv = r.level;
  const noticed = yesQs.length
    ? `<ul class="noticed">${yesQs.map((q) => `<li>${icon("check", 18)}<span>${esc(Lt(q.text))}</span></li>`).join("")}</ul>`
    : `<p class="lead">${esc(t("result.noneNoticed"))}</p>`;
  const next = lv.service
    ? serviceCard(lv.service)
    : `<div class="card stack"><p>${esc(t("result.steadyNext"))}</p><a class="btn sage" href="#/support">${esc(t("result.seeSupport"))}</a></div>`;
  return `<div class="stack">
    ${back ? `<div>${backLink(back.href, back.label)}</div>` : ""}
    <div class="level-head"><div class="row wrap"><span class="small">${esc(t(example ? "result.exampleKicker" : "result.kicker"))}</span>${pillFor(lv)}</div>
      <h1>${esc(t(`result.levels.${lv.id}.title`))}</h1></div>
    <p class="lead">${esc(t(`result.levels.${lv.id}.body`))}</p>
    <div class="card stack"><h3>${esc(t("result.noticedHeading"))}</h3>${noticed}
      ${skipped ? `<p class="small">${esc(t("result.skipped", { n: skipped, total: c.questions.length }))}</p>` : ""}</div>
    ${phone ? phoneSection(scenarioId) : ""}
    <h2>${esc(t("result.nextHeading"))}</h2>
    ${next}
    ${emergencyCard()}
    ${saved ? `<p class="small row">${icon("shield-check", 18)}<span>${esc(t("result.saved"))}</span></p>` : ""}
    ${saved ? nextTryCard() : ""}
    <a class="btn ghost" href="${back ? back.href : "#/"}">${esc(back ? back.label : t("result.again"))}</a></div>`;
}

/** Every level, how many yes answers lead to it and where it points: what a university reviews. */
function viewResults() {
  const c = app.config;
  const total = c.questions.length;
  const items = levelRanges(c).map(({ level: lv, lo, hi }) => {
    const range = lo === hi ? `${lo}` : `${lo}–${hi}`;
    const target = lv.service ? Lt(c.services[lv.service]?.name) : t("results.supportList");
    return `<li><a href="#/preview/${esc(lv.id)}">
      <span class="grow stack-tight">${pillFor(lv)}<strong>${esc(t(`result.levels.${lv.id}.title`))}</strong>
        <span class="small">${esc(t("results.yes", { range, total }))}</span>
        <span class="small">${esc(t("results.suggests", { target }))}</span></span>${icon("arrow-right", 20)}</a></li>`;
  }).join("");
  return `<div class="stack">
    <div>${backLink("#/about", t("preview.about"))}</div>
    <h1>${esc(t("results.title"))}</h1>
    <p class="lead">${esc(t("results.lead"))}</p>
    <ul class="level-list">${items}</ul>
    <p class="small row">${icon("siren", 18)}<span>${esc(t("results.emergencyNote"))}</span></p></div>`;
}

function fmtDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(app.lang, { day: "numeric", month: "short" });
}

/** Weeks are labelled by their Monday, whichever day the check-in was done. */
function fmtWeek(e) { return fmtDate(weekStart(new Date(`${e.date}T12:00:00`))); }
/** Compact label for the chart, for example 28/9 or 9/28 depending on the language. */
function fmtShort(e) {
  return new Date(`${weekStart(new Date(`${e.date}T12:00:00`))}T12:00:00`).toLocaleDateString(app.lang, { day: "numeric", month: "numeric" });
}

function viewHistory() {
  const entries = app.store.entries();
  if (!entries.length) {
    return `<div class="stack"><h1>${esc(t("history.title"))}</h1><p class="lead">${esc(t("history.empty"))}</p></div>`;
  }
  const total = app.config.questions.length;
  const rows = entries.map((e) => ({ e, r: resultFor(app.config, e.answers) }));
  // The chart shows the last seven weeks so it always fits a small phone; the list has them all.
  const recent = rows.slice(-7);
  const chart = recent.map(({ e, r }) => `<div class="col"><div class="bar l-${esc(r.level.id)}" style="height:${Math.max(4, (r.yes / total) * 100)}%"></div><span class="lab${e.demo ? "" : " own"}">${esc(fmtShort(e))}</span></div>`).join("");
  const item = ({ e, r }) => `<li><a href="#/result/${esc(e.week)}" aria-label="${esc(t("history.open"))}: ${esc(t("history.weekOf", { date: fmtWeek(e) }))}">
      <span class="grow"><strong>${esc(t("history.weekOf", { date: fmtWeek(e) }))}</strong>
        <span class="week-meta">${pillFor(r.level)}<span class="small">${esc(t("history.signs", { n: r.yes, total }))}</span></span></span>${icon("arrow-right", 18)}</a></li>`;
  const newestFirst = [...rows].reverse();
  const own = newestFirst.filter(({ e }) => !e.demo), examples = newestFirst.filter(({ e }) => e.demo);
  const lists = examples.length
    ? `<h2>${esc(t("history.ownHeading"))}</h2>
       ${own.length ? `<ul class="week-list">${own.map(item).join("")}</ul>` : `<p class="small">${esc(t("history.ownEmpty"))}</p>`}
       <div class="row wrap"><h2 class="grow">${esc(t("history.examplesHeading"))}</h2>${exampleTag()}</div>
       <ul class="week-list">${examples.map(item).join("")}</ul>`
    : `<h2>${esc(t("history.listHeading"))}</h2><ul class="week-list">${own.map(item).join("")}</ul>`;
  return `<div class="stack"><h1>${esc(t("history.title"))}</h1>
    ${examples.length ? `<p class="small">${esc(t("history.examplesNote"))}</p>` : ""}
    <div class="card"><h3>${esc(t("history.trendHeading"))}</h3><div class="chart" role="img" aria-label="${esc(t("history.chartLabel"))}: ${recent.map(({ e, r }) => `${fmtWeek(e)} ${r.yes}/${total}`).join(", ")}">${chart}</div></div>
    ${lists}</div>`;
}

function viewSupport() {
  const c = app.config;
  return `<div class="stack">
    <h1>${esc(t("more.supportHeading"))}</h1><p class="lead">${esc(t("more.supportLead"))}</p>
    ${Object.keys(c.services).map((id) => serviceCard(id)).join("")}
    ${emergencyCard()}</div>`;
}

function resetCard() {
  // Preview builds call it "Start over" (the examples come back); otherwise "Delete my data".
  const k = isPreview() ? "about.startOver" : "more.delete";
  if (app.deleted) return `<p class="card" data-keep="delete" role="status">${esc(t(`${k}Done`))}</p>`;
  const ic = isPreview() ? "rotate-ccw" : "trash-2";
  if (app.confirmDelete) {
    return `<div class="card stack" data-keep="delete" role="alertdialog" aria-label="${esc(t(`${k}Confirm`))}"><p><strong>${esc(t(`${k}Confirm`))}</strong></p>
      <button class="btn danger" data-delete="yes">${icon(ic, 20)}${esc(t(`${k}Yes`))}</button>
      <button class="btn ghost" data-delete="no">${esc(t(`${k}Cancel`))}</button></div>`;
  }
  return `<div class="card stack" data-keep="delete"><h3>${esc(t(`${k}Heading`))}</h3><p class="small">${esc(t(`${k}Body`))}</p>
    <button class="btn danger" data-delete="ask">${icon(ic, 20)}${esc(t(`${k}Button`))}</button></div>`;
}

function viewAbout() {
  const c = app.config;
  const mail = feedbackHref();
  const done = triedDone();
  const tries = isPreview()
    ? `<section class="stack"><div><h2>${esc(t("about.tryHeading"))}</h2>
        <p class="small">${esc(t(done.size === TRIES.length ? "about.allDone" : "about.progress", { n: done.size, total: TRIES.length }))}</p></div>
        <ol class="try">${app.ui.about.try.map((it, i) => {
          const ok = done.has(TRIES[i]);
          const num = ok ? `<span class="num done">${icon("check", 18)}<span class="sr">${esc(t("about.doneLabel"))}</span></span>` : `<span class="num">${i + 1}</span>`;
          return `<li>${tryLink(TRIES[i], `${num}<span class="grow"><strong>${esc(typo(it.h))}</strong><br><span class="small">${esc(typo(it.p.replace(/\{name\}/g, uniName())))}</span></span>${icon("arrow-right", 18)}`, ok ? "done" : "")}</li>`;
        }).join("")}</ol></section>`
    : "";
  const demo = isPreview() ? "" : showsExamples()
    ? `<div class="card stack" data-keep="demo"><h3>${esc(t("demo.toggleTitle"))}</h3><p class="small">${esc(t("demo.toggleOn"))}</p>
        <button class="btn ghost" data-demo="off">${esc(t("demo.turnOff"))}</button>
        <a class="btn ghost" href="#/results">${esc(t("results.title"))}</a></div>`
    : `<div class="card stack" data-keep="demo"><h3>${esc(t("demo.toggleTitle"))}</h3><p class="small">${esc(t("demo.toggleOff"))}</p>
        <button class="btn ghost" data-demo="on">${esc(t("demo.turnOn"))}</button></div>`;
  return `<div class="stack">
    <h1>${esc(t(isPreview() ? "about.title" : "nav.about"))}</h1>
    ${isPreview() ? `<p class="lead">${esc(t("about.intro"))}</p>` : ""}
    ${tries}
    <h2>${esc(t("more.languageHeading"))}</h2>${langButtons("lang")}
    <div class="card stack"><h3>${esc(t("more.feedbackHeading"))}</h3><p class="small">${esc(t("more.feedbackBody"))}</p>
      <a class="btn sage" href="${esc(mail)}" data-track="feedback">${icon("mail", 20)}${esc(t("more.feedbackButton"))}</a></div>
    <a class="link-row" href="#/privacy"><span class="row">${icon("shield-check", 20)}${esc(t("more.privacyLink"))}</span>${icon("arrow-right", 18)}</a>
    ${installTip()}
    ${demo}
    ${resetCard()}
    <p class="small version">${esc(t("more.version", { v: document.querySelector('meta[name="cc-build"]')?.content || "dev" }))}</p></div>`;
}

function viewPrivacy() {
  const pts = app.ui.privacy.points.map((p) => `<div><dt>${esc(typo(p.h))}</dt><dd>${esc(typo(p.p.replace(/\{name\}/g, uniName())))}</dd></div>`).join("");
  return `<div class="stack privacy"><div>${backLink("#/about", t("preview.about"))}</div>
    <h1>${esc(t("privacy.title"))}</h1><p class="lead">${esc(t("privacy.intro"))}</p>
    <div class="card"><dl>${pts}</dl></div><p class="small">${esc(t("privacy.principles"))}</p></div>`;
}

/* ---------- Routing and events ---------- */

/**
 * Re-render the current screen in place, for taps that change something on it
 * (language, example week, start over). The section that was tapped (its
 * `data-keep`) stays at the same spot on screen, and focus moves to `focusSel`
 * inside it without scrolling. Moving to another screen goes through route().
 */
function refresh(fromEl = null, focusSel = null, alsoRender = null) {
  const key = fromEl?.closest("[data-keep]")?.dataset.keep;
  const before = key ? document.querySelector(`[data-keep="${key}"]`).getBoundingClientRect().top : null;
  const y = window.scrollY;
  // Measure first, then change the header or banner (Safari has no scroll anchoring),
  // and keep the page at least as tall as it was, so a section that shrinks at the
  // bottom of the page does not pull everything up.
  const view = $("view");
  view.style.minHeight = `${view.offsetHeight}px`;
  alsoRender?.();
  route({ inPlace: true });
  const anchor = key && document.querySelector(`[data-keep="${key}"]`);
  if (anchor) window.scrollTo(0, window.scrollY + anchor.getBoundingClientRect().top - before);
  else window.scrollTo(0, y);
  const f = focusSel && document.querySelector(focusSel);
  if (f) {
    if (!f.matches("a, button")) f.setAttribute("tabindex", "-1");
    f.focus({ preventScroll: true });
  }
}

function route(opts) {
  const inPlace = opts?.inPlace === true;
  const hash = location.hash.replace(/^#\/?/, "");
  const [name, arg] = hash.split("/");
  if (name === "more") { location.replace("#/about"); return; }
  if ((!name || name === "home") && isPreview() && !app.store.isWelcomed()) { location.replace("#/welcome"); return; }
  // Remember where each tab was scrolled, so coming back to it (from Privacy, a
  // result or a preview) lands where you left it instead of at the top.
  if (!inPlace && TABS.has(app.screen)) app.tabScroll[app.screen] = window.scrollY;
  const from = app.screen;
  if (!inPlace) app.screen = name || "home";
  // The preview line is hidden on the welcome screen and during the check-in.
  const bare = (s) => s === "welcome" || s === "check";
  if (from !== app.screen && (bare(from) || bare(app.screen))) renderShell();
  const view = $("view");
  let html = "", nav = "home";
  if (name === "welcome") { nav = null; html = viewWelcome(); }
  else if (name === "check") { nav = null; html = viewCheck(Number(arg)); if (html === null) return; }
  else if (name === "result") {
    const e = app.store.entryForWeek(arg || currentWeek());
    if (!e) { location.replace("#/"); return; }
    const own = !e.demo;
    const fromHistory = inPlace ? app.resultBack === "history" : from === "history";
    if (!inPlace) app.resultBack = fromHistory ? "history" : null;
    html = viewResult(e.answers, {
      saved: own, example: !own, phone: own && e.week === currentWeek(), scenarioId: e.scenario,
      back: fromHistory ? { href: "#/history", label: t("history.title") } : null,
    });
    nav = fromHistory ? "history" : "home";
  } else if (name === "preview") {
    const lv = app.config.levels.find((l) => l.id === arg);
    if (!lv) { location.replace("#/results"); return; }
    html = viewResult(answersForLevel(app.config, lv), { example: true, back: { href: "#/results", label: t("results.back") } });
    nav = "about";
  } else if (name === "results") { nav = "about"; html = viewResults(); if (isPreview()) app.store.markTried("results"); }
  else if (name === "history") { nav = "history"; html = viewHistory(); }
  else if (name === "support") { nav = "support"; html = viewSupport(); if (isPreview()) app.store.markTried("support"); }
  else if (name === "about") { nav = "about"; html = viewAbout(); }
  else if (name === "privacy") { nav = "about"; html = viewPrivacy(); }
  else html = viewHome();
  if (name !== "about") { app.confirmDelete = false; app.deleted = false; }
  view.innerHTML = html;
  $("actions").innerHTML = name === "check" ? checkAnswers(Number(arg))
    : name === "welcome" ? `<button class="btn" data-welcome>${esc(t("welcome.start"))}${icon("arrow-right", 20)}</button>` : "";
  renderNav(nav);
  syncDock();
  if (!inPlace) {
    view.style.minHeight = "";
    const back = TABS.has(app.screen) && from !== "check" && from !== app.screen ? app.tabScroll[app.screen] : 0;
    window.scrollTo(0, back || 0);
    view.focus({ preventScroll: true });
  }
}

function onClick(ev) {
  if (ev.target.closest("[data-track]")?.dataset.track === "feedback") app.store.markTried("feedback");
  const el = ev.target.closest("[data-answer],[data-lang],[data-demo],[data-delete],[data-reset],[data-scenario],[data-welcome],[data-replace]");
  if (!el) return;
  if (el.dataset.reset !== undefined) { app.answers = {}; return; }
  if (el.dataset.replace !== undefined) {
    // Inside the check-in, moving between questions replaces the history entry, so the
    // whole check-in is one step back: the phone's back button returns to where it started.
    ev.preventDefault();
    location.replace(el.getAttribute("href"));
    return;
  }
  if (el.dataset.welcome !== undefined) {
    app.store.setWelcomed();
    location.replace("#/");
    return;
  }
  if (el.dataset.answer) {
    const n = Number(el.dataset.n);
    // Ignore a second tap while moving on, and taps on a question that is no longer shown.
    if (app.advancing || n !== checkIndex()) return;
    const qs = questionsInOrder();
    const q = qs[n];
    if (!q) return;
    const v = el.dataset.answer;
    app.answers[q.id] = v === "yes" ? true : v === "no" ? false : null;
    el.closest(".answers")?.querySelectorAll("[data-answer]").forEach((b) => b.classList.toggle("picked", b === el && v !== "skip"));
    app.advancing = true;
    // A short pause shows which answer was taken before the next question appears.
    setTimeout(() => {
      app.advancing = false;
      if (checkIndex() !== n) return;
      if (n + 1 < qs.length) { location.replace(`#/check/${n + 1}`); return; }
      const now = new Date();
      const week = weekKey(now);
      const entry = { week, date: isoDate(now), answers: { ...app.answers }, qv: Object.fromEntries(qs.map((x) => [x.id, x.version])) };
      if (showsExamples()) entry.scenario = scenario();
      app.store.save(entry);
      if (isPreview()) { app.store.markTried("checkin"); if (entry.scenario) app.store.markTried(`scenario:${entry.scenario}`); }
      app.answers = {};
      location.replace(`#/result/${week}`);
    }, v === "skip" ? 60 : 180);
  } else if (el.dataset.scenario) {
    if (SCENARIO_IDS.includes(el.dataset.scenario)) app.store.setScenario(el.dataset.scenario);
    refresh(el, `[data-scenario="${el.dataset.scenario}"]`);
  } else if (el.dataset.lang) {
    setLang(el.dataset.lang, el, `[data-lang="${el.dataset.lang}"]`);
  } else if (el.dataset.demo) {
    app.store.setDemo(el.dataset.demo === "on", el.dataset.demo === "on" ? demoEntries(app.config) : []);
    refresh(el, "[data-demo]", renderShell);
  } else if (el.dataset.delete) {
    const step = el.dataset.delete;
    if (step === "ask") app.confirmDelete = true;
    if (step === "no") app.confirmDelete = false;
    if (step === "yes") {
      app.store.clearAll();
      app.answers = {};
      app.confirmDelete = false;
      if (isPreview()) {
        // Start over: the examples come back, the language is kept, the welcome screen shows again.
        app.store.setLang(app.lang);
        app.store.setDemo(true, demoEntries(app.config));
        app.tabScroll = {};
        location.replace("#/welcome");
        return;
      }
      app.deleted = true;
    }
    refresh(el, app.deleted ? '[data-keep="delete"]' : app.confirmDelete ? '[data-delete="no"]' : '[data-delete="ask"]', step === "yes" ? renderShell : null);
  }
}

/**
 * The app runs from its offline copy, so a new version arrives in the background.
 * When it has taken over, reload once to show it, but never in the middle of a
 * check-in (answers in progress live in memory): wait until the student leaves it.
 * Also look for a new version whenever the app comes back to the foreground,
 * because installed apps on phones are resumed far more often than relaunched.
 */
function watchForUpdates() {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  const reloadWhenSafe = () => {
    if (reloading) return;
    if (location.hash.startsWith("#/check")) {
      window.addEventListener("hashchange", function wait() {
        if (location.hash.startsWith("#/check")) return;
        window.removeEventListener("hashchange", wait);
        reloadWhenSafe();
      });
      return;
    }
    reloading = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) reloadWhenSafe(); });
  navigator.serviceWorker.register("sw.js").then((reg) => {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => {});
}

async function init() {
  const params = new URLSearchParams(location.search);
  const id = resolveUniversityId(location.search, document.querySelector('meta[name="cc-university"]')?.content);
  const { config, fellBack } = await loadConfig(id);
  app.config = config; app.fellBack = fellBack;
  app.store = createStore(window.localStorage, config.id);
  app.lang = pickLanguage(config, { search: location.search, stored: app.store.getLang(), browser: navigator.languages || [navigator.language] });
  app.ui = await loadUi(app.lang);
  if (isPreview()) {
    if (!app.store.isDemo()) app.store.setDemo(true, demoEntries(config));
  } else {
    if (params.get("demo") === "1" && !app.store.isDemo()) app.store.setDemo(true, demoEntries(config));
    if (params.get("demo") === "0") app.store.setDemo(false);
  }
  renderShell();
  document.addEventListener("click", onClick);
  window.addEventListener("hashchange", route);
  new ResizeObserver(syncDock).observe($("dock"));
  route();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    watchForUpdates();
  }
}

init().catch((err) => {
  $("view").innerHTML = `<p class="card">CalmCampus could not start. ${esc(err.message)}</p>`;
});
