// Builds dist/ : the default university at the root and every other university in
// its own folder (dist/epfl/). Each folder is a complete, installable PWA with
// its own manifest and service worker, so any static host can serve it as is.
//
//   node scripts/build.mjs            all universities
//   node scripts/build.mjs --only epfl
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const dist = path.join(root, "dist");
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

const ids = readdirSync(path.join(root, "config/universities")).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
if (only && !ids.includes(only)) { console.error(`Unknown university "${only}". Known: ${ids.join(", ")}`); process.exit(1); }

const list = (dir, base = dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? list(p, base) : [path.relative(base, p)];
  });

function buildOne(id, out) {
  mkdirSync(out, { recursive: true });
  cpSync(src, out, { recursive: true });
  cpSync(path.join(root, "config"), path.join(out, "config"), { recursive: true });

  const cfg = JSON.parse(readFileSync(path.join(root, `config/universities/${id}.json`), "utf8"));
  let html = readFileSync(path.join(out, "index.html"), "utf8");
  html = html.replace('name="cc-university" content="default"', `name="cc-university" content="${id}"`)
    .replace('<html lang="en">', `<html lang="${cfg.defaultLanguage}">`);
  writeFileSync(path.join(out, "index.html"), html);

  writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify({
    name: "CalmCampus",
    short_name: "CalmCampus",
    description: "Notice early signs and reach the right campus support. Your answers stay on your device.",
    start_url: "./",
    scope: "./",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5EAD8",
    theme_color: "#F5EAD8",
    lang: cfg.defaultLanguage,
    icons: [
      { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, null, 2));

  // Service worker: precache every file, versioned by a hash of their contents.
  const files = list(out).filter((f) => f !== "sw.js" && f !== "_headers" && !f.endsWith(".txt"));
  const hash = createHash("sha256");
  for (const f of files.sort()) hash.update(f).update(readFileSync(path.join(out, f)));
  const shell = ["./", ...files.map((f) => f)];
  let sw = readFileSync(path.join(out, "sw.js"), "utf8");
  sw = sw.replace("__ID__", id).replace("__BUILD__", hash.digest("hex").slice(0, 10)).replace("__SHELL__", JSON.stringify(shell));
  writeFileSync(path.join(out, "sw.js"), sw);
  console.log(`built ${path.relative(root, out) || "."}  (${id}, ${files.length} files)`);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
// Default first, so its folder only ever holds its own files when the shell list is made.
const targets = only ? [only] : [...ids].sort((a, b) => (a === "default" ? -1 : b === "default" ? 1 : a.localeCompare(b)));
for (const id of targets) buildOne(id, id === "default" ? dist : path.join(dist, id));
// Hosting headers (Netlify / Cloudflare Pages format): the service worker must never be cached.
writeFileSync(path.join(dist, "_headers"), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/sw.js
  Cache-Control: no-cache
/*/sw.js
  Cache-Control: no-cache
`);
