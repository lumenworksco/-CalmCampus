// Validates every university config and every UI string file.
// Fails (exit 1) on: missing translations, broken service/level references,
// bad contact formats, exclamation marks, emoji, banned clinical words, or a
// misspelled product name. TODO placeholders are reported as warnings.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SIGNAL_IDS } from "../src/lib/signals.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

const BANNED = {
  en: [/at[- ]risk/i, /disorder/i, /\bdisease/i, /\billness/i, /\bpatients?\b/i, /\bsyndrome/i, /\bdepress/i],
  fr: [/à risque/i, /\btrouble/i, /\bmaladie/i, /\bpatient/i, /\bsyndrome/i, /\bdépress/i],
};

function walk(value, where, fn) {
  if (typeof value === "string") fn(value, where);
  else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`, fn));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, `${where}.${k}`, fn);
}

function flatten(obj, prefix = "", out = {}) {
  if (typeof obj === "string") out[prefix] = obj;
  else if (Array.isArray(obj)) obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  else for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function lintVoice(text, lang, where) {
  if (text.includes("!")) err(where, `exclamation mark in "${text.slice(0, 50)}"`);
  if (/\p{Extended_Pictographic}/u.test(text)) err(where, "emoji");
  for (const re of BANNED[lang] ?? []) if (re.test(text)) err(where, `banned word ${re} in "${text.slice(0, 50)}"`);
  if (/calm\s+campus|calmCampus|Calmcampus/i.test(text.replace(/CalmCampus/g, ""))) err(where, "product name must be written CalmCampus");
}

/* ---------- UI strings ---------- */
const uiDir = path.join(root, "src/i18n");
const uiLangs = readdirSync(uiDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
const ui = Object.fromEntries(uiLangs.map((l) => [l, flatten(read(`src/i18n/${l}.json`))]));
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const baseKeys = Object.keys(ui.en);
for (const lang of uiLangs) {
  for (const k of baseKeys) {
    if (!(k in ui[lang])) err(`i18n/${lang}`, `missing key ${k}`);
    else {
      if (!ui[lang][k].trim()) err(`i18n/${lang}`, `empty ${k}`);
      if (placeholders(ui[lang][k]) !== placeholders(ui.en[k])) err(`i18n/${lang}`, `placeholder mismatch in ${k}`);
    }
  }
  for (const k of Object.keys(ui[lang])) if (!(k in ui.en)) err(`i18n/${lang}`, `extra key ${k}`);
  for (const [k, v] of Object.entries(ui[lang])) lintVoice(v, lang, `i18n/${lang}.${k}`);
}
if (!ui.en.disclaimer.startsWith("We are not medical professionals. CalmCampus does not diagnose or treat; it helps students notice early signs and reach the right support.")) {
  err("i18n/en", "disclaimer text must match the agreed wording exactly");
}

/* ---------- University configs ---------- */
const cfgDir = path.join(root, "config/universities");
const files = readdirSync(cfgDir).filter((f) => f.endsWith(".json"));
if (!files.includes("default.json")) err("config", "default.json is required");

for (const f of files) {
  const id = f.replace(".json", "");
  const where = `config/${f}`;
  const c = read(`config/universities/${f}`);
  if (c.id !== id) err(where, `"id" must equal the file name (${id})`);
  if (!c.name) err(where, "name is required");
  if (!Array.isArray(c.languages) || !c.languages.length) { err(where, "languages is required"); continue; }
  if (!c.languages.includes(c.defaultLanguage)) err(where, "defaultLanguage must be one of languages");
  for (const l of c.languages) if (!uiLangs.includes(l)) err(where, `language "${l}" has no src/i18n/${l}.json`);

  const needLoc = (v, w) => {
    if (!v || typeof v !== "object") return err(w, "must be an object with one text per language");
    for (const l of c.languages) if (!v[l] || !String(v[l]).trim()) err(w, `missing "${l}" text`);
  };

  if (!c.feedback?.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.feedback.email)) err(where, "feedback.email invalid");
  if (!c.feedback?.subject) err(where, "feedback.subject required");

  if (c.questions?.length !== 4) err(where, "exactly 4 questions are required");
  const qids = new Set();
  (c.questions ?? []).forEach((q, i) => {
    if (!q.id || qids.has(q.id)) err(where, `question ${i} needs a unique id`);
    qids.add(q.id);
    if (!Number.isInteger(q.version)) err(where, `question ${q.id} needs an integer version`);
    if (q.signals !== undefined && (!Array.isArray(q.signals) || q.signals.some((s) => !SIGNAL_IDS.includes(s))))
      err(where, `question ${q.id}: signals must be a list of ${SIGNAL_IDS.join(", ")}`);
    needLoc(q.text, `${where} questions[${i}].text`);
  });

  const mins = (c.levels ?? []).map((l) => l.minYes);
  if (!mins.includes(0)) err(where, "levels must include one with minYes 0");
  if (new Set(mins).size !== mins.length) err(where, "levels must have distinct minYes");
  if (Math.max(...mins) > 4) err(where, "minYes cannot exceed the number of questions");
  for (const lv of c.levels ?? []) {
    if (!ui.en[`result.levels.${lv.id}.title`]) err(where, `level "${lv.id}" has no UI text (result.levels.${lv.id}.*)`);
    if (lv.service && !c.services?.[lv.service]) err(where, `level "${lv.id}" points to unknown service "${lv.service}"`);
  }

  for (const [sid, s] of Object.entries(c.services ?? {})) {
    const w = `${where} services.${sid}`;
    needLoc(s.name, `${w}.name`); needLoc(s.purpose, `${w}.purpose`);
    const ct = s.contact ?? {};
    if (ct.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ct.email)) err(w, "contact.email invalid");
    if (ct.phone && !/^\+?[\d\s]+$/.test(ct.phone)) err(w, "contact.phone must be digits, spaces and an optional +");
    if (ct.link) for (const l of c.languages) { const u = ct.link[l]; if (!u || !/^https:\/\//.test(u)) err(w, `contact.link.${l} must be an https URL`); }
    if (ct.hours) needLoc(ct.hours, `${w}.contact.hours`);
    if (s.verified && !s.source) err(w, "verified services need a source URL");
    if (!ct.email && !ct.phone && !ct.link) warnings.push(`${w}: no contact details yet`);
    for (const todo of s.todo ?? []) warnings.push(`${w}: TODO ${todo}`);
  }

  if (!c.emergency?.length) err(where, "at least one emergency number is required");
  (c.emergency ?? []).forEach((e, i) => {
    const w = `${where} emergency[${i}]`;
    if (!e.number || !/^[\d\s+]+$/.test(e.number)) err(w, "number invalid");
    if (!e.tel || !/^\+?\d+$/.test(e.tel)) err(w, "tel must be digits with an optional +");
    needLoc(e.label, `${w}.label`); needLoc(e.detail, `${w}.detail`);
    if (!e.source && id !== "default") warnings.push(`${w}: no source URL`);
  });
  if (c.logo?.todo) warnings.push(`${where}: logo: ${c.logo.todo}`);

  for (const l of c.languages) {
    walk(c, where, (text, w) => {
      // Only lint the text of this language: localized leaves live under a key equal to l.
      if (w.endsWith(`.${l}`)) lintVoice(text, l, w);
    });
  }
}

for (const w of warnings) console.log(`warn  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log(`ok    ${files.length} configs, ${uiLangs.length} languages, ${baseKeys.length} UI strings per language`);
