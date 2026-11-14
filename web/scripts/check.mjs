// Validates every university config and every UI string file.
// Fails (exit 1) on: missing translations, broken service/level references,
// bad contact formats, exclamation marks, emoji, banned clinical words, or a
// misspelled product name. TODO placeholders are reported as warnings.
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  nl: [/risicogroep/i, /\brisico\b/i, /stoornis/i, /\bziekte/i, /\bpatiënt/i, /\bsyndroom/i, /\bdepressi/i],
};
// The check-in "takes less than a minute": never a time in seconds.
const SECONDS = /\b\d+\s?(?:s|sec)(?![\p{L}\d])|\b(?:seconds?|secondes?|seconden?)\b/iu;

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
  if (SECONDS.test(text)) err(where, `time in seconds in "${text.slice(0, 50)}" (say "less than a minute")`);
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
if (!ui.en.disclaimer.startsWith("We are students, not medical professionals. CalmCampus does not diagnose or treat; it helps students notice early signs and reach the right support.")) {
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
  if (c.nameInText !== undefined && (typeof c.nameInText !== "object" || !Object.values(c.nameInText).every((v) => typeof v === "string" && v.trim()))) err(where, "nameInText must have one text per language");
  if (!Array.isArray(c.languages) || !c.languages.length) { err(where, "languages is required"); continue; }
  if (!c.languages.includes(c.defaultLanguage)) err(where, "defaultLanguage must be one of languages");
  for (const l of c.languages) if (!uiLangs.includes(l)) err(where, `language "${l}" has no src/i18n/${l}.json`);

  const needLoc = (v, w) => {
    if (!v || typeof v !== "object") return err(w, "must be an object with one text per language");
    for (const l of c.languages) if (!v[l] || !String(v[l]).trim()) err(w, `missing "${l}" text`);
  };

  if (!c.feedback?.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.feedback.email)) err(where, "feedback.email invalid");
  if (!c.feedback?.subject) err(where, "feedback.subject required");
  else if (typeof c.feedback.subject !== "string") needLoc(c.feedback.subject, `${where} feedback.subject`);
  if (c.publicUrl !== undefined && !/^https:\/\/.+\/$/.test(c.publicUrl)) err(where, "publicUrl must be an https URL ending in /");
  if (c.qr !== undefined && !existsSync(path.join(root, c.qr))) err(where, `qr file not found: ${c.qr}`);
  if (c.qr !== undefined && !c.publicUrl) err(where, "qr needs publicUrl (the address the code opens)");

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

  const checkLevels = (levels, services, w) => {
    const mins = (levels ?? []).map((l) => l.minYes);
    if (!mins.includes(0)) err(w, "levels must include one with minYes 0");
    if (new Set(mins).size !== mins.length) err(w, "levels must have distinct minYes");
    if (Math.max(...mins) > 4) err(w, "minYes cannot exceed the number of questions");
    for (const lv of levels ?? []) {
      if (!ui.en[`result.levels.${lv.id}.title`]) err(w, `level "${lv.id}" has no UI text (result.levels.${lv.id}.*)`);
      if (lv.service && !services?.[lv.service]) err(w, `level "${lv.id}" points to unknown service "${lv.service}"`);
    }
  };
  const checkServices = (services, wBase) => {
    for (const [sid, s] of Object.entries(services ?? {})) {
      const w = `${wBase} services.${sid}`;
      needLoc(s.name, `${w}.name`); needLoc(s.purpose, `${w}.purpose`);
      if (s.note) needLoc(s.note, `${w}.note`);
      const ct = s.contact ?? {};
      if (ct.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ct.email)) err(w, "contact.email invalid");
      if (ct.phone && !/^\+?[\d\s]+$/.test(ct.phone)) err(w, "contact.phone must be digits, spaces and an optional +");
      if (ct.link) for (const l of c.languages) { const u = ct.link[l]; if (!u || !/^https:\/\//.test(u)) err(w, `contact.link.${l} must be an https URL`); }
      if (ct.hours) needLoc(ct.hours, `${w}.contact.hours`);
      if (s.verified && !s.source) err(w, "verified services need a source URL");
      if (!ct.email && !ct.phone && !ct.link) warnings.push(`${w}: no contact details yet`);
      for (const todo of s.todo ?? []) warnings.push(`${w}: TODO ${todo}`);
    }
  };
  const checkEmergency = (list, wBase, required) => {
    if (required && !list?.length) err(wBase, "at least one emergency number is required");
    (list ?? []).forEach((e, i) => {
      const w = `${wBase} emergency[${i}]`;
      if (!e.number || !/^[\d\s+]+$/.test(e.number)) err(w, "number invalid");
      if (!e.tel || !/^\+?\d+$/.test(e.tel)) err(w, "tel must be digits with an optional +");
      needLoc(e.label, `${w}.label`); needLoc(e.detail, `${w}.detail`);
      if (!e.source && id !== "default") warnings.push(`${w}: no source URL`);
    });
  };

  checkLevels(c.levels, c.services, where);
  checkServices(c.services, where);
  checkEmergency(c.emergency, where, true);

  // Several universities in one config: each with its own services, levels and numbers.
  const insts = c.institutions ?? [];
  if (!Array.isArray(insts)) err(where, "institutions must be a list");
  const instIds = new Set();
  insts.forEach((inst, i) => {
    const w = `${where} institutions[${i}]`;
    if (!inst.id || !/^[a-z0-9-]+$/.test(inst.id) || instIds.has(inst.id)) err(w, "needs a unique id (a-z, 0-9, -)");
    instIds.add(inst.id);
    needLoc(inst.name, `${w}.name`);
    if (inst.nameInText) needLoc(inst.nameInText, `${w}.nameInText`);
    if (inst.hint) needLoc(inst.hint, `${w}.hint`);
    if (inst.advice) needLoc(inst.advice, `${w}.advice`);
    checkServices(inst.services, w);
    checkLevels(inst.levels ?? c.levels, inst.services ?? {}, w);
    checkEmergency(inst.emergency, w, false);
    if (!Object.keys(inst.services ?? {}).length && !inst.advice) err(w, "an institution without services needs advice text");
  });

  // Extra pages (#/<id>), the guide's own steps, and the welcome extras.
  const RESERVED = new Set(["", "home", "welcome", "pick", "check", "result", "preview", "results", "history", "support", "about", "privacy", "more"]);
  const pageIds = new Set();
  const checkBlock = (b, w) => {
    const kinds = ["h", "p", "note", "list", "items", "box", "links", "table"].filter((k) => b[k] !== undefined);
    if (kinds.length !== 1) return err(w, "a block has exactly one of h, p, note, list, items, box, links, table");
    const k = kinds[0];
    if (k === "h" || k === "p" || k === "note") needLoc(b[k], `${w}.${k}`);
    if (k === "list") for (const l of c.languages) if (!Array.isArray(b.list[l]) || !b.list[l].length) err(w, `list needs a "${l}" list`);
    if (k === "items") b.items.forEach((it, j) => { needLoc(it.h, `${w}.items[${j}].h`); needLoc(it.p, `${w}.items[${j}].p`); });
    if (k === "box") b.box.forEach((x, j) => checkBlock(x, `${w}.box[${j}]`));
    if (k === "links") for (const pid of b.links) if (!(c.pages ?? []).some((pg) => pg.id === pid)) err(w, `links to unknown page "${pid}"`);
    if (k === "table") {
      const tb = b.table;
      needLoc(tb.caption, `${w}.table.caption`);
      // Numbers in a table are never presented as results: each table says what they are.
      if (tb.label !== "example" && tb.label !== "target") err(w, 'table.label must be "example" (made-up numbers) or "target" (proposed targets)');
      if (tb.label === "target") needLoc(tb.note, `${w}.table.note`);
      for (const l of c.languages) {
        const head = tb.head?.[l], rows = tb.rows?.[l];
        if (!Array.isArray(head) || !Array.isArray(rows) || rows.some((r) => !Array.isArray(r) || r.length !== head.length)) err(w, `table "${l}": rows must match the header`);
      }
    }
  };
  (c.pages ?? []).forEach((pg, i) => {
    const w = `${where} pages[${i}]`;
    if (!pg.id || !/^[a-z0-9-]+$/.test(pg.id) || RESERVED.has(pg.id) || pageIds.has(pg.id)) err(w, "needs a unique id that is not an app screen");
    pageIds.add(pg.id);
    needLoc(pg.title, `${w}.title`);
    for (const k of ["eyebrow", "lead", "linkLabel"]) if (pg[k]) needLoc(pg[k], `${w}.${k}`);
    if (pg.frame) for (const k of ["label", "app"]) needLoc(pg.frame[k], `${w}.frame.${k}`);
    if (pg.frame) { needLoc(pg.frame.card?.text, `${w}.frame.card.text`); needLoc(pg.frame.card?.button, `${w}.frame.card.button`); }
    (pg.blocks ?? []).forEach((b, j) => checkBlock(b, `${w}.blocks[${j}]`));
  });
  for (const pid of [...(c.welcomeLinks ?? []), ...(c.aboutPages?.ids ?? [])]) if (!pageIds.has(pid)) err(where, `unknown page "${pid}" in welcomeLinks or aboutPages`);
  if (c.aboutPages) needLoc(c.aboutPages.heading, `${where} aboutPages.heading`);
  if (c.welcomeNote) needLoc(c.welcomeNote, `${where} welcomeNote`);
  (c.tries ?? []).forEach((x, i) => {
    const w = `${where} tries[${i}]`;
    if (!x.id || !x.href) err(w, "needs id and href");
    needLoc(x.h, `${w}.h`); needLoc(x.p, `${w}.p`);
    if (x.marks !== undefined && (!Array.isArray(x.marks) || !x.marks.every((m) => typeof m === "string"))) err(w, "marks must be a list of strings");
  });
  if (c.logo?.text && typeof c.logo.text !== "string") needLoc(c.logo.text, `${where} logo.text`);

  if (c.logo?.todo) warnings.push(`${where}: logo: ${c.logo.todo}`);

  for (const l of c.languages) {
    walk(c, where, (text, w) => {
      // Only lint the text of this language: localized leaves live under a key equal to l.
      if (new RegExp(`\\.${l}(\\[\\d+\\])*$`).test(w)) lintVoice(text, l, w);
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
