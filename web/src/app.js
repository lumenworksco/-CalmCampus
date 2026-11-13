import { icon } from "./lib/icons.js";
import { loadConfig, resolveUniversityId } from "./lib/config.js";
import { loc, pickLanguage, translate } from "./lib/i18n.js";
import { resultFor, answersForLevel } from "./lib/scoring.js";
import { createStore } from "./lib/store.js";
import { demoEntries } from "./lib/demo.js";
import { isoDate, weekKey, weekStart } from "./lib/week.js";
import { SCENARIO_IDS, DEFAULT_SCENARIO, weekSignals, signalsFor, orderQuestions } from "./lib/signals.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const app = { config: null, store: null, lang: "en", ui: {}, answers: {}, confirmDelete: false, deleted: false, fellBack: false };

const t = (key, vars) => translate(app.ui, key, { name: app.config?.name, ...vars });
const L = (value) => loc(value, app.lang, app.config.defaultLanguage);

async function loadUi(lang) {
  const res = await fetch(`i18n/${lang}.json`);
  if (!res.ok) throw new Error(`i18n ${lang}`);
  return res.json();
}

/* ---------- Shell ---------- */

function renderShell() {
  const c = app.config;
  const chip = c.logo?.image
    ? `<span class="uni-chip"><img src="${esc(c.logo.image)}" alt="${esc(c.name)}"></span>`
    : c.logo?.text ? `<span class="uni-chip">${esc(c.logo.text)}</span>` : "";
  const other = c.languages.length > 1 ? c.languages.find((l) => l !== app.lang) : null;
  const switcher = other
    ? `<button class="lang" id="lang-toggle" lang="${other}" aria-label="${esc(app.ui.lang.switchTo)}">${icon("languages", 18)}${esc(other.toUpperCase())}</button>`
    : "";
  $("top").innerHTML = `<div class="brand"><a class="wordmark" href="#/">CalmCampus</a>${chip}</div>${switcher}`;
  $("lang-toggle")?.addEventListener("click", () => setLang(other));
  $("disclaimer").textContent = t("disclaimer");
  document.documentElement.lang = app.lang;

  $("demo-banner").innerHTML = app.store.isDemo()
    ? `<div class="demo-banner" role="status">${icon("flask-conical", 18)}<span><strong>${esc(t("demo.label"))}.</strong> ${esc(t("demo.banner"))}</span><button id="demo-exit">${esc(t("demo.exit"))}</button></div>`
    : "";
  $("demo-exit")?.addEventListener("click", () => {
    app.store.setDemo(false);
    renderShell();
    if (location.hash && location.hash !== "#/") location.hash = "#/"; else route();
  });
}

function renderNav(active) {
  if (!active) { $("nav").innerHTML = ""; return; }
  const items = [["home", "house", "#/"], ["history", "chart-no-axes-column", "#/history"], ["more", "ellipsis", "#/more"]];
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

/* ---------- Views ---------- */

const currentWeek = () => weekKey(new Date());

function pillFor(level) {
  return `<span class="pill ${esc(level.id)}">${esc(t(`result.levels.${level.id}.pill`))}</span>`;
}

function demoTag() {
  return app.store.isDemo() ? `<span class="pill demo">${icon("flask-conical", 14)}${esc(t("demo.label"))}</span>` : "";
}

function previewList() {
  return `<div class="card stack" data-keep="preview"><div><h3>${esc(t("demo.preview"))}</h3><p class="small">${esc(t("demo.previewHint"))}</p></div>
    <div class="row wrap">${app.config.levels.map((lv) => `<a class="pill ${esc(lv.id)}" href="#/preview/${esc(lv.id)}" style="min-height:44px;text-decoration:none">${esc(t(`result.levels.${lv.id}.pill`))}</a>`).join("")}</div></div>`;
}

/* ---------- Simulated phone signals (demo mode only, see lib/signals.js) ---------- */

function scenario() {
  const s = app.store.getScenario();
  return SCENARIO_IDS.includes(s) ? s : DEFAULT_SCENARIO;
}
const phoneSignals = () => (app.store.isDemo() ? weekSignals(scenario()) : null);
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

function signalsCard() {
  const sigs = phoneSignals();
  if (!sigs) return "";
  const cur = scenario();
  const seg = `<div class="scen" role="group" aria-label="${esc(t("signals.scenarioLabel"))}">${SCENARIO_IDS.map((id) =>
    `<button class="btn ${id === cur ? "sage" : "ghost"}" data-scenario="${id}" aria-pressed="${id === cur}">${esc(t(`signals.scenarios.${id}`))}</button>`).join("")}</div>`;
  const rows = sigs.map((s) => {
    const max = Math.max(...s.days, s.usual) || 1;
    const status = s.notable ? s.direction : "same";
    const bars = s.days.map((d) => `<i style="height:${Math.max(8, (d / max) * 100).toFixed(1)}%"></i>`).join("");
    return `<li class="sig${s.notable ? " notable" : ""}">
      <div class="sig-head"><strong>${esc(t(`signals.names.${s.id}`))}</strong>
        <span class="pill ${s.notable ? "notice" : "steady"}">${esc(t(`signals.status.${status}`))}</span></div>
      <p class="small"><strong class="val">${esc(fmtSignal(s.id, s.mean))}</strong> ${esc(t(`signals.per.${s.id}`))}. <span class="nowrap"><span class="usual-key" aria-hidden="true"></span>${esc(t("signals.usual", { value: fmtSignal(s.id, s.usual) }))}</span></p>
      <div class="sig-bars" role="img" aria-label="${esc(t("signals.dayLabel"))}: ${esc(s.days.map((d) => fmtSignal(s.id, d)).join(", "))}">${bars}<span class="usual" style="bottom:${((s.usual / max) * 100).toFixed(1)}%"></span></div></li>`;
  }).join("");
  return `<section class="card stack signals" data-keep="signals" aria-labelledby="sig-h">
    <div class="row wrap"><h2 id="sig-h" class="grow">${esc(t("signals.heading"))}</h2>${demoTag()}</div>
    <p class="small">${esc(t("signals.simulated"))}</p>
    <div><p class="small"><strong>${esc(t("signals.scenarioLabel"))}</strong></p>${seg}</div>
    <ul class="sig-list">${rows}</ul>
    <p class="small">${esc(t("signals.wearable"))}</p></section>`;
}

function checkContext(q) {
  const sigs = phoneSignals();
  if (!sigs) return "";
  const hits = signalsFor(q, sigs);
  if (hits.length) {
    return `<div class="hint"><div class="row wrap"><strong class="row grow">${icon("smartphone", 18)}${esc(t("signals.noticedHeading"))}</strong>${demoTag()}</div>
      ${hits.map((s) => `<p>${esc(signalHint(s))}</p>`).join("")}
      <p class="you">${esc(t("signals.youDecide"))}</p></div>`;
  }
  return q.signals?.length ? "" : `<p class="small row">${icon("smartphone", 18)}<span>${esc(t("signals.noSignal"))}</span></p>`;
}

function phoneSection() {
  const sigs = phoneSignals();
  if (!sigs) return "";
  const hits = sigs.filter((s) => s.notable);
  return `<div class="card stack"><div class="row wrap"><h3 class="grow">${esc(t("signals.resultHeading"))}</h3>${demoTag()}</div>
    ${hits.length
      ? `<ul class="noticed">${hits.map((s) => `<li>${icon("smartphone", 18)}<span>${esc(signalHint(s))}</span></li>`).join("")}</ul>`
      : `<p>${esc(t("signals.resultNone"))}</p>`}
    <p class="small">${esc(t("signals.resultNote"))}</p></div>`;
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
    <p class="lead">${esc(t("home.lead"))}</p>
    ${signalsCard()}
    <p class="small row">${icon("shield-check", 18)}<span>${esc(t("home.stays"))}</span></p>
    ${app.store.isDemo() ? previewList() : ""}
  </div>`;
}

function viewCheck(n) {
  const qs = questionsInOrder();
  if (!(n >= 0 && n < qs.length)) { location.hash = "#/"; return ""; }
  const q = qs[n];
  const dots = qs.map((_, i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("");
  return `<div class="stack">
    <div class="row"><a class="btn ghost sm" href="${n === 0 ? "#/" : `#/check/${n - 1}`}">${icon("arrow-left", 18)}${esc(t("checkin.back"))}</a>
      <span class="small grow" style="text-align:right">${esc(t("checkin.progress", { n: n + 1, total: qs.length }))}</span></div>
    <div class="progress" aria-hidden="true">${dots}</div>
    <p class="small">${esc(t("checkin.heading"))}</p>
    <h1 class="question" id="q">${esc(L(q.text))}</h1>
    ${checkContext(q)}</div>`;
}

/** Yes and No sit in the bottom dock during the check-in, so they are always in reach. */
function checkAnswers(n) {
  const q = questionsInOrder()[n];
  if (!q) return "";
  const picked = app.answers[q.id];
  return `<div class="answers" role="group" aria-labelledby="q">
      <button class="btn ${picked === true ? "picked" : ""}" data-answer="yes">${esc(t("checkin.yes"))}</button>
      <button class="btn ${picked === false ? "picked" : ""}" data-answer="no">${esc(t("checkin.no"))}</button>
    </div>`;
}

function serviceCard(id, { actions = true } = {}) {
  const s = app.config.services[id];
  if (!s) return "";
  const c = s.contact || {};
  const link = L(c.link), hours = L(c.hours), note = L(s.note);
  const btns = [];
  if (c.email) btns.push({ href: `mailto:${c.email}`, label: t("service.email"), ic: "mail", ext: false });
  if (link) btns.push({ href: link, label: t("service.website"), ic: "external-link", ext: true });
  if (c.phone) btns.push({ href: `tel:${c.phone.replace(/\s/g, "")}`, label: `${t("service.call")} ${c.phone}`, ic: "phone", ext: false });
  const buttons = actions && btns.length
    ? `<div class="actions">${btns.map((b, i) => `<a class="btn ${i ? "ghost" : ""}" href="${esc(b.href)}" ${b.ext ? 'target="_blank" rel="noopener noreferrer"' : ""}>${icon(b.ic, 20)}${esc(b.label)}</a>`).join("")}</div>`
    : "";
  return `<section class="card service" aria-labelledby="s-${esc(id)}">
    <h3 id="s-${esc(id)}">${esc(L(s.name))}</h3>
    <p>${esc(L(s.purpose))}</p>
    ${note ? `<p class="small">${esc(note)}</p>` : ""}
    ${btns.length ? "" : `<p class="small">${esc(t("service.noContact"))}</p>`}
    ${buttons}
    ${hours ? `<p class="meta">${icon("clock", 16)} ${esc(hours)}</p>` : ""}
    ${c.email && actions ? `<p class="small" style="margin-top:8px">${esc(t("service.emailNote"))}</p>` : ""}
  </section>`;
}

function emergencyCard() {
  const items = app.config.emergency.map((e) => `<div class="em-item">
      <div class="label">${esc(L(e.label))}</div>
      <a class="call" href="tel:${esc(e.tel)}">${icon("phone", 22)}${esc(e.number)}</a>
      <div class="detail">${esc(L(e.detail))}</div></div>`).join("");
  return `<section class="emergency" aria-labelledby="em-h">
    <h2 id="em-h">${icon("siren", 24)}${esc(t("result.emergencyHeading"))}</h2>
    <p class="intro">${esc(t("result.emergencyIntro"))}</p>${items}</section>`;
}

function viewResult(answers, { saved, preview, phone } = {}) {
  const c = app.config;
  const r = resultFor(c, answers);
  const yesQs = c.questions.filter((q) => answers[q.id] === true);
  const lv = r.level;
  const noticed = yesQs.length
    ? `<ul class="noticed">${yesQs.map((q) => `<li>${icon("check", 18)}<span>${esc(L(q.text))}</span></li>`).join("")}</ul>`
    : `<p class="lead">${esc(t("result.noneNoticed"))}</p>`;
  const next = lv.service
    ? serviceCard(lv.service)
    : `<div class="card stack"><p>${esc(t("result.steadyNext"))}</p><a class="btn sage" href="#/more">${esc(t("result.seeSupport"))}</a></div>`;
  return `<div class="stack">
    <div class="level-head"><div class="row wrap"><span class="small">${esc(t("result.kicker"))}</span>${pillFor(lv)}${preview || app.store.isDemo() ? demoTag() : ""}</div>
      <h1>${esc(t(`result.levels.${lv.id}.title`))}</h1></div>
    <p class="lead">${esc(t(`result.levels.${lv.id}.body`))}</p>
    <div class="card stack"><h3>${esc(t("result.noticedHeading"))}</h3>${noticed}</div>
    ${phone ? phoneSection() : ""}
    <h2>${esc(t("result.nextHeading"))}</h2>
    ${next}
    ${emergencyCard()}
    ${saved ? `<p class="small row">${icon("shield-check", 18)}<span>${esc(t("result.saved"))}</span></p>` : ""}
    <a class="btn ghost" href="#/">${esc(t("result.again"))}</a></div>`;
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
  const chart = rows.map(({ e, r }) => `<div class="col"><div class="bar l-${esc(r.level.id)}" style="height:${Math.max(4, (r.yes / total) * 100)}%"></div><span class="lab">${esc(fmtShort(e))}</span></div>`).join("");
  const list = [...rows].reverse().map(({ e, r }) => `<li><a href="#/result/${esc(e.week)}" aria-label="${esc(t("history.open"))}: ${esc(t("history.weekOf", { date: fmtWeek(e) }))}">
      <span class="grow"><strong>${esc(t("history.weekOf", { date: fmtWeek(e) }))}</strong><br><span class="small">${esc(t("history.signs", { n: r.yes, total }))}</span></span>${pillFor(r.level)}${icon("arrow-right", 18)}</a></li>`).join("");
  return `<div class="stack"><div class="row wrap"><h1>${esc(t("history.title"))}</h1>${demoTag()}</div>
    <div class="card"><h3>${esc(t("history.trendHeading"))}</h3><div class="chart" role="img" aria-label="${esc(t("history.chartLabel"))}: ${rows.map(({ e, r }) => `${fmtWeek(e)} ${r.yes}/${total}`).join(", ")}">${chart}</div></div>
    <h2>${esc(t("history.listHeading"))}</h2><ul class="week-list">${list}</ul></div>`;
}

function viewMore() {
  const c = app.config;
  const langs = c.languages.length > 1
    ? `<div class="seg" data-keep="lang" role="group" aria-label="${esc(t("more.languageHeading"))}">${c.languages.map((l) => `<button class="btn ${l === app.lang ? "sage" : "ghost"} sm" data-lang="${l}" lang="${l}" ${l === app.lang ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${esc(l.toUpperCase())}</button>`).join("")}</div>` : "";
  const demo = app.store.isDemo()
    ? `<div class="card stack" data-keep="demo"><h3>${esc(t("demo.toggleTitle"))}</h3><p class="small">${esc(t("demo.toggleOn"))}</p>
        <button class="btn ghost" data-demo="off">${esc(t("demo.turnOff"))}</button></div>${previewList()}`
    : `<div class="card stack" data-keep="demo"><h3>${esc(t("demo.toggleTitle"))}</h3><p class="small">${esc(t("demo.toggleOff"))}</p>
        <button class="btn ghost" data-demo="on">${esc(t("demo.turnOn"))}</button></div>`;
  const del = app.deleted
    ? `<p class="card" data-keep="delete" role="status">${esc(t("more.deleted"))}</p>`
    : app.confirmDelete
      ? `<div class="card stack" data-keep="delete" role="alertdialog" aria-label="${esc(t("more.deleteConfirm"))}"><p><strong>${esc(t("more.deleteConfirm"))}</strong></p>
          <button class="btn danger" data-delete="yes">${icon("trash-2", 20)}${esc(t("more.deleteYes"))}</button>
          <button class="btn ghost" data-delete="no">${esc(t("more.deleteCancel"))}</button></div>`
      : `<div class="card stack" data-keep="delete"><h3>${esc(t("more.deleteHeading"))}</h3><p class="small">${esc(t("more.deleteBody"))}</p>
          <button class="btn danger" data-delete="ask">${icon("trash-2", 20)}${esc(t("more.deleteButton"))}</button></div>`;
  const fb = c.feedback;
  const mail = `mailto:${fb.email}?subject=${encodeURIComponent(fb.subject)}`;
  return `<div class="stack">
    <h1>${esc(t("more.title"))}</h1>
    <h2>${esc(t("more.supportHeading"))}</h2><p class="lead">${esc(t("more.supportLead"))}</p>
    ${Object.keys(c.services).map((id) => serviceCard(id)).join("")}
    ${emergencyCard()}
    ${langs ? `<h2>${esc(t("more.languageHeading"))}</h2>${langs}` : ""}
    <h2>${esc(t("more.installHeading"))}</h2>
    <div class="card stack small"><p>${esc(t("more.installIos"))}</p><p>${esc(t("more.installAndroid"))}</p></div>
    <a class="link-row" href="#/privacy"><span>${icon("shield-check", 20)} ${esc(t("more.privacyLink"))}</span>${icon("arrow-right", 18)}</a>
    ${demo}
    <div class="card stack"><h3>${esc(t("more.feedbackHeading"))}</h3><p class="small">${esc(t("more.feedbackBody"))}</p>
      <a class="btn sage" href="${esc(mail)}">${icon("mail", 20)}${esc(t("more.feedbackButton"))}</a></div>
    ${del}</div>`;
}

function viewPrivacy() {
  const pts = app.ui.privacy.points.map((p) => `<div><dt>${esc(p.h)}</dt><dd>${esc(p.p.replace(/\{name\}/g, app.config.name))}</dd></div>`).join("");
  return `<div class="stack privacy"><a class="btn ghost sm" href="#/more">${icon("arrow-left", 18)}${esc(t("checkin.back"))}</a>
    <h1>${esc(t("privacy.title"))}</h1><p class="lead">${esc(t("privacy.intro"))}</p>
    <div class="card"><dl>${pts}</dl></div><p class="small">${esc(t("privacy.principles"))}</p></div>`;
}

/* ---------- Routing and events ---------- */

/**
 * Re-render the current screen in place, for taps that change something on it
 * (language, demo mode, example week, delete). The section that was tapped
 * (its `data-keep`) stays at the same spot on screen, and focus moves to `focusSel`
 * inside it without scrolling. Moving to another screen goes through route() and
 * starts at the top.
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
  const view = $("view");
  let html = "", nav = "home";
  if (name === "check") {
    nav = null; html = viewCheck(Number(arg));
  } else if (name === "result") {
    const e = app.store.entryForWeek(arg || currentWeek());
    if (e) html = viewResult(e.answers, { saved: !app.store.isDemo(), phone: e.week === currentWeek() });
    else { location.hash = "#/"; return; }
  } else if (name === "preview" && app.store.isDemo()) {
    const lv = app.config.levels.find((l) => l.id === arg);
    if (lv) html = viewResult(answersForLevel(app.config, lv), { preview: true });
    else { location.hash = "#/"; return; }
  } else if (name === "history") { nav = "history"; html = viewHistory(); }
  else if (name === "more") { nav = "more"; html = viewMore(); }
  else if (name === "privacy") { nav = "more"; html = viewPrivacy(); }
  else html = viewHome();
  if (name !== "more") { app.confirmDelete = false; app.deleted = false; }
  view.innerHTML = html;
  $("actions").innerHTML = name === "check" ? checkAnswers(Number(arg)) : "";
  renderNav(nav);
  syncDock();
  if (!inPlace) {
    view.style.minHeight = "";
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }
}

function onClick(ev) {
  const el = ev.target.closest("[data-answer],[data-lang],[data-demo],[data-delete],[data-reset],[data-scenario]");
  if (!el) return;
  if (el.dataset.reset !== undefined) { app.answers = {}; return; }
  if (el.dataset.answer) {
    const n = Number(location.hash.split("/")[2]);
    const qs = questionsInOrder();
    app.answers[qs[n].id] = el.dataset.answer === "yes";
    if (n + 1 < qs.length) { location.hash = `#/check/${n + 1}`; return; }
    const now = new Date();
    const qv = Object.fromEntries(qs.map((q) => [q.id, q.version]));
    const week = weekKey(now);
    app.store.save({ week, date: isoDate(now), answers: { ...app.answers }, qv });
    app.answers = {};
    location.hash = `#/result/${week}`;
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
      app.confirmDelete = false; app.deleted = true;
      app.answers = {};
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
  if (params.get("demo") === "1" && !app.store.isDemo()) app.store.setDemo(true, demoEntries(config));
  if (params.get("demo") === "0") app.store.setDemo(false);
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
