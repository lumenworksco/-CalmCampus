/** Pick the text for `lang` from a {lang: text} object, falling back to any language. */
export function loc(value, lang, fallbackLang) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value[lang] ?? value[fallbackLang] ?? Object.values(value)[0] ?? null;
}

/** Look up a dotted key and fill {placeholders}. Returns the key itself if missing. */
export function translate(dict, key, vars = {}) {
  const raw = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), dict);
  if (typeof raw !== "string") return key;
  return raw.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

/** URL ?lang= wins, then the saved choice, then the browser, then the config default. */
export function pickLanguage(config, { search = "", stored = null, browser = [] } = {}) {
  const ok = (l) => l && config.languages.includes(l);
  const fromUrl = new URLSearchParams(search).get("lang");
  if (ok(fromUrl)) return fromUrl;
  if (ok(stored)) return stored;
  for (const tag of browser) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (ok(base)) return base;
  }
  return config.defaultLanguage;
}
