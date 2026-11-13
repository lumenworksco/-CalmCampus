import { icon } from "./lib/icons.js";
import { loadConfig, resolveUniversityId } from "./lib/config.js";
import { loc, pickLanguage, translate } from "./lib/i18n.js";
import { resultFor, answersForLevel } from "./lib/scoring.js";
import { createStore } from "./lib/store.js";
import { demoEntries } from "./lib/demo.js";
import { isoDate, weekKey, weekStart } from "./lib/week.js";

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
  $("demo-exit")?.addEventListener("click", () => { app.store.setDemo(false); location.hash = "#/"; route(); });
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

async function setLang(lang) {
  app.lang = lang;
  app.store.setLang(lang);
  app.ui = await loadUi(lang);
  renderShell();
  route();
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
  return `<div class="card stack"><div><h3>${esc(t("demo.preview"))}</h3><p class="small">${esc(t("demo.previewHint"))}</p></div>
    <div class="row wrap">${app.config.levels.map((lv) => `<a class="pill ${esc(lv.id)}" href="#/preview/${esc(lv.id)}" style="min-height:44px;text-decoration:none">${esc(t(`result.levels.${lv.id}.pill`))}</a>`).join("")}</div></div>`;
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
    <p class="lead">${esc(t("home.lead"))}</p>
    ${done}
    <p class="small row">${icon("shield-check", 18)}<span>${esc(t("home.stays"))}</span></p>
    ${app.store.isDemo() ? previewList() : ""}
  </div>`;
}

function viewCheck(n) {
  const qs = app.config.questions;
  if (!(n >= 0 && n < qs.length)) { location.hash = "#/"; return ""; }
  const q = qs[n];
  const picked = app.answers[q.id];
  const dots = qs.map((_, i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("");
  return `<div class="stack">
    <div class="row"><a class="btn ghost sm" href="${n === 0 ? "#/" : `#/check/${n - 1}`}">${icon("arrow-left", 18)}${esc(t("checkin.back"))}</a>
      <span class="small grow" style="text-align:right">${esc(t("checkin.progress", { n: n + 1, total: qs.length }))}</span></div>
    <div class="progress" aria-hidden="true">${dots}</div>
    <p class="small">${esc(t("checkin.heading"))}</p>
    <h1 class="question" id="q">${esc(L(q.text))}</h1>
    <div class="answers" role="group" aria-labelledby="q">
      <button class="btn ${picked === true ? "picked" : ""}" data-answer="yes">${esc(t("checkin.yes"))}</button>
      <button class="btn ${picked === false ? "picked" : ""}" data-answer="no">${esc(t("checkin.no"))}</button>
    </div></div>`;
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

function viewResult(answers, { saved, preview } = {}) {
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

function viewHistory() {
  const entries = app.store.entries();
  if (!entries.length) {
    return `<div class="stack"><h1>${esc(t("history.title"))}</h1><p class="lead">${esc(t("history.empty"))}</p></div>`;
  }
  const total = app.config.questions.length;
  const rows = entries.map((e) => ({ e, r: resultFor(app.config, e.answers) }));
  const chart = rows.map(({ e, r }) => `<div class="col"><div class="bar l-${esc(r.level.id)}" style="height:${Math.max(4, (r.yes / total) * 100)}%"></div><span class="lab">${esc(fmtWeek(e))}</span></div>`).join("");
  const list = [...rows].reverse().map(({ e, r }) => `<li><a href="#/result/${esc(e.week)}" aria-label="${esc(t("history.open"))}: ${esc(t("history.weekOf", { date: fmtWeek(e) }))}">
      <span class="grow"><strong>${esc(t("history.weekOf", { date: fmtWeek(e) }))}</strong><br><span class="small">${esc(t("history.signs", { n: r.yes, total }))}</span></span>${pillFor(r.level)}${icon("arrow-right", 18)}</a></li>`).join("");
  return `<div class="stack"><div class="row wrap"><h1>${esc(t("history.title"))}</h1>${demoTag()}</div>
    <div class="card"><h3>${esc(t("history.trendHeading"))}</h3><div class="chart" role="img" aria-label="${esc(t("history.chartLabel"))}: ${rows.map(({ e, r }) => `${fmtWeek(e)} ${r.yes}/${total}`).join(", ")}">${chart}</div></div>
    <h2>${esc(t("history.listHeading"))}</h2><ul class="week-list">${list}</ul></div>`;
}

function viewMore() {
  const c = app.config;
  const langs = c.languages.length > 1
    ? `<div class="seg" role="group" aria-label="${esc(t("more.languageHeading"))}">${c.languages.map((l) => `<button class="btn ${l === app.lang ? "sage" : "ghost"} sm" data-lang="${l}" lang="${l}" ${l === app.lang ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${esc(l.toUpperCase())}</button>`).join("")}</div>` : "";
  const demo = app.store.isDemo()
    ? `<div class="card stack"><h3>${esc(t("demo.toggleTitle"))}</h3><p class="small">${esc(t("demo.toggleOn"))}</p>
        <button class="btn ghost" data-demo="off">${esc(t("demo.turnOff"))}</button></div>${previewList()}`
    : `<div class="card stack"><h3>${esc(t("demo.toggleTitle"))}</h3><p class="small">${esc(t("demo.toggleOff"))}</p>
        <button class="btn ghost" data-demo="on">${esc(t("demo.turnOn"))}</button></div>`;
  const del = app.deleted
    ? `<p class="card" role="status">${esc(t("more.deleted"))}</p>`
    : app.confirmDelete
      ? `<div class="card stack" role="alertdialog" aria-label="${esc(t("more.deleteConfirm"))}"><p><strong>${esc(t("more.deleteConfirm"))}</strong></p>
          <button class="btn danger" data-delete="yes">${icon("trash-2", 20)}${esc(t("more.deleteYes"))}</button>
          <button class="btn ghost" data-delete="no">${esc(t("more.deleteCancel"))}</button></div>`
      : `<div class="card stack"><h3>${esc(t("more.deleteHeading"))}</h3><p class="small">${esc(t("more.deleteBody"))}</p>
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

// `keep`: re-render in place (no jump to the top) and focus the element matching this
// selector. Used for the delete steps, which sit at the bottom of a long page.
function route(opts) {
  const keep = typeof opts?.focus === "string" ? opts.focus : null;
  const hash = location.hash.replace(/^#\/?/, "");
  const [name, arg] = hash.split("/");
  const view = $("view");
  let html = "", nav = "home";
  if (name === "check") {
    nav = null; html = viewCheck(Number(arg));
  } else if (name === "result") {
    const e = app.store.entryForWeek(arg || currentWeek());
    if (e) html = viewResult(e.answers, { saved: !app.store.isDemo() });
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
  renderNav(nav);
  syncDock();
  const target = keep && view.querySelector(keep);
  if (target) {
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "center" });
  } else {
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }
}

function onClick(ev) {
  const el = ev.target.closest("[data-answer],[data-lang],[data-demo],[data-delete],[data-reset]");
  if (!el) return;
  if (el.dataset.reset !== undefined) { app.answers = {}; return; }
  if (el.dataset.answer) {
    const n = Number(location.hash.split("/")[2]);
    const qs = app.config.questions;
    app.answers[qs[n].id] = el.dataset.answer === "yes";
    if (n + 1 < qs.length) { location.hash = `#/check/${n + 1}`; return; }
    const now = new Date();
    const qv = Object.fromEntries(qs.map((q) => [q.id, q.version]));
    const week = weekKey(now);
    app.store.save({ week, date: isoDate(now), answers: { ...app.answers }, qv });
    app.answers = {};
    location.hash = `#/result/${week}`;
  } else if (el.dataset.lang) {
    setLang(el.dataset.lang);
  } else if (el.dataset.demo) {
    app.store.setDemo(el.dataset.demo === "on", el.dataset.demo === "on" ? demoEntries(app.config) : []);
    renderShell(); route();
  } else if (el.dataset.delete) {
    const step = el.dataset.delete;
    if (step === "ask") app.confirmDelete = true;
    if (step === "no") app.confirmDelete = false;
    if (step === "yes") {
      app.store.clearAll();
      app.confirmDelete = false; app.deleted = true;
      app.answers = {};
      renderShell();
    }
    route({ focus: app.deleted ? '[role="status"]' : app.confirmDelete ? '[role="alertdialog"]' : '[data-delete="ask"]' });
  }
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
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init().catch((err) => {
  $("view").innerHTML = `<p class="card">CalmCampus could not start. ${esc(err.message)}</p>`;
});
