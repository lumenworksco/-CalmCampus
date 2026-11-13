// One-off: renders the PWA icons (terracotta tile, cream Lucide sprout).
// Needs Playwright: run from a folder where `playwright` is installed.
//   node scripts/make-icons.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(process.env.PW_DIR ? path.join(process.env.PW_DIR, "x.js") : import.meta.url);
const { chromium } = require("playwright");
const { icon } = await import("../src/lib/icons.js");
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/icons");

const sprout = (size, scale) => icon("sprout", size * scale).replace('stroke="currentColor"', 'stroke="#F5EAD8"').replace('stroke-width="2.75"', 'stroke-width="2.2"');
const page = (size, scale, radius) => `<body style="margin:0;width:${size}px;height:${size}px;background:#C67139;border-radius:${radius}px;display:grid;place-items:center">${sprout(size, scale)}</body>`;

const browser = await chromium.launch();
for (const [name, size, scale, radius] of [["icon-192", 192, 0.6, 0], ["icon-512", 512, 0.6, 0], ["icon-maskable-512", 512, 0.5, 0], ["apple-touch-icon", 180, 0.6, 0]]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(page(size, scale, radius));
  await p.screenshot({ path: path.join(out, `${name}.png`) });
}
await browser.close();
