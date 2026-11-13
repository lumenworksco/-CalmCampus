# Handoff: EPFL reviewer demo (web/)

> **For the next Claude session.** This file is self-contained. Do the setup below, read it fully, then continue with "Still to do". Do not push to `main` or deploy anything without asking Florian first.

## Setup on a new computer

```bash
git clone https://github.com/lumenworksco/CalmCampus.git   # GitHub redirects from the new name -CalmCampus
cd CalmCampus && git checkout epfl-web-demo
cd web && npm run check && npm test && npm run build        # needs Node 20+; no npm install needed
npm run dev                                                 # http://localhost:8080  (EPFL at /epfl/)
```

Branch `epfl-web-demo` is not merged into `main` yet. If SSH to GitHub fails, push over HTTPS (`gh auth login`, then `git push https://github.com/lumenworksco/CalmCampus.git <branch>`).

## First message to paste into the new session

"Read web/HANDOFF.md and web/README.md on branch epfl-web-demo. Continue with the 'Still to do' list, starting with the deployment step. Ask me before pushing or publishing anything."

Written 2026-11-13 so work can continue from another machine or Claude account. Read this, then `web/README.md` and the repo `CLAUDE.md`.

## Goal

Send EPFL (Rodrigue Ambara, Consultation sociale) a demo to test on his own phone for a few days and review with colleagues and the student association AGEPoly. EPFL says students reach their service too late, and they are dropping Trust Point. This is a reviewer demo, not a pilot: no real student data, no analytics. Every future university should be a config file, not a code change.

Team: Florian Braun and Helene David. CalmCampus is not medical: it does not diagnose or treat, it helps students notice early signs and points them to the right campus support.

## Done

- `web/` is a PWA in vanilla JS with no runtime dependencies. One JSON config per university in `web/config/universities/` (`default`, `epfl`).
- Selecting a university: folder (`dist/epfl/`) or `?u=epfl`. Language: browser language, FR/EN button, or `?lang=`.
- Weekly check-in: four yes/no questions in config (localised), result screen with one next step from config, the required disclaimer always visible, and an emergency block on every result.
- Privacy: answers only in `localStorage` (keys start with `cc:`), "Delete my data", privacy screen in plain words ("design principles", not "certified"), no third-party requests (fonts and Lucide icons bundled, CSP `connect-src 'self'`).
- Demo mode (`?demo=1` or More > Demo mode): six made-up weeks covering every level, labelled "Demo data", stored under a separate key, "Preview every result". Per-university flag.
- Simulated phone signals (demo mode only, `src/lib/signals.js`): a "This week on your phone" card with sleep, phone use after midnight and steps against the student's usual, three example weeks (calm, exam, heavy). Questions with a notable signal come first and show what the phone noticed; the result lists it too. Signals never answer a question or change the level; the result comes from the answers alone. Which signal belongs to which question is `signals` on each question in the config. A browser cannot read Apple Health or Screen Time, so the web version only simulates; the native iOS app reads sleep and steps for real (`ios/CalmCampus/Sensing/`).
- "Send feedback": mailto to contact@calm.braunf.com, subject from config, nothing attached.
- Brand: cream/sand/terracotta/sage/ink, Caprasimo and Figtree, Lucide icons at stroke 2.75. Text accents use darker tints (`--terracotta-deep`, `--sage-deep`) for contrast.
- PWA: per-folder manifest and service worker, offline shell, icons. Caches are prefixed per university so folders do not delete each other's caches.
- Checks: `npm run check` (FR/EN parity, placeholders, references, contact formats, voice lint), `npm test` (12 tests), `npm run build`. Also run end to end in emulated iPhone SE, iPhone 14 (WebKit) and Pixel 7 (Chromium) with Playwright. That script is not in the repo; it covered check-in, language switch, delete, demo, every preview level, offline, `?u=`, no external hosts, no horizontal overflow.
- EPFL facts verified on epfl.ch and chuv.ch on 2026-11-12 (source URL stored per entry in the config). Emails live in the page source behind email protection, so decode them from the raw HTML.

## Still to do

1. ~~Deploy.~~ **Done 2026-11-13.** Live at `https://cc.braunf.com/epfl/` (copied from `web/dist/epfl/` to `docs/epfl/` in `_CalmWeb`). To update: `npm run build`, `rsync -a --delete dist/epfl/ ../../_CalmWeb/docs/epfl/`, run `python3 scripts/check-site.py` there, commit, push.
2. ~~Fill the TODOs in `epfl.json`.~~ **Done 2026-11-13.** Neither service publishes a phone number or opening hours (both are reached by email; the CHUV says students book directly). Checked the EPFL service pages, "in detail", Trust and Support Network, Student Services and the CHUV page; recorded as `notPublished`. The Student Services desk number (021 693 43 45) is deliberately not used. Added La Main Tendue's English line (0800 143 000, from EPFL's French social consultation page). Still open: the logo (text placeholder until EPFL gives permission). Worth asking Rodrigue whether his team wants a phone number or hours shown.
3. **EPFL review of product choices.** Not reviewed by EPFL yet. Checked against EPFL's and CHUV's own pages on 2026-11-13 and kept as they are:
   - Routing: 1-2 yes to Consultation sociale, 3-4 yes to the CHUV psychotherapeutic consultation. Kept: the CHUV page is for students whose study difficulties or low mood "put them in crisis" and lets them book directly; Consultation sociale presents itself as the first stop for stress, motivation, planning and isolation, and refers on. Still the most sensitive choice; one line per level in `levels`.
   - A steady result points to the support list, not to a service. Kept: nothing on EPFL's pages suggests sending a student with no signs to one particular service.
   - The four question wordings (sleep, planning, getting started, avoiding). Kept: they match the topics Consultation sociale lists.
   - French uses "tu"; EPFL's pages use "vous" throughout (22 times on the social consultation page, never "tu"). Kept "tu" for now because `src/i18n/fr.json` is shared by every university; switching per university needs a register option in the code. Ask EPFL and AGEPoly.
   Ask these four in the email to EPFL.
4. ~~Re-verify EPFL details.~~ **Done 2026-11-13**: service emails (decoded from the page source), links, emergency numbers (115, 021 693 3000, SOS in the EPFL Campus app, 144, 0848 133 133, 143) all match their source pages. Repeat if the email goes out after about a week, since EPFL is restructuring these pages.
5. **Test on real devices** (iPhone Safari and Android Chrome). So far only emulated sizes.
6. **Email to EPFL.** The "What to test" text is below. The email text says install first from Safari, then use the app only from its icon, because Safari and the installed app have separate storage on iPhone.
7. Optional, not requested: put the Playwright check script in the repo; add a language beyond FR/EN.

## What to test (paste into the email)

1. Install from Safari (iPhone) or Chrome (Android) via Add to Home Screen, then open the app only from its icon.
2. Do the weekly check-in: four yes/no questions, under a minute.
3. Go to More > Demo mode > Turn on. Use "Preview every result" to see all four levels and the next step each one suggests.
4. Switch between FR and EN. Does the wording feel kind and clear, and is the next step the right one for the level?
5. Send feedback from More (opens an email draft, nothing attached). Delete my data wipes everything on the phone.

## Known limitations

- iPhone: Safari and the installed app have separate storage.
- Clearing browser data deletes answers; nothing is backed up, by design.
- No sync between devices.
- GitHub Pages keeps ordinary request logs; the privacy screen says so.
- Demo mode is the one allowed place for made-up data (exception to the "no synthetic data" rule in `CLAUDE.md`).

## Commands

```bash
cd web
npm run check   # configs and strings
npm test        # unit tests
npm run build   # check + build dist/ (default at root, dist/epfl/ for EPFL)
npm run dev     # build and serve at http://localhost:8080 (EPFL at /epfl/)
```

Rules to keep: never change a question `id` (bump `version` when wording changes); no exclamation marks, emoji, or clinical words ("at-risk", "disorder"); the product name is always "CalmCampus"; no screeners or self-harm questions; nothing sends answers off the device.
