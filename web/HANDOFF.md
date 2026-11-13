# Handoff: EPFL reviewer preview (web/)

> **For the next Claude session.** This file is self-contained. Do the setup below, read it fully, then continue with "Still to do". Do not push to `main` or deploy anything without asking Florian first.

## Setup on a new computer

```bash
git clone https://github.com/lumenworksco/CalmCampus.git   # GitHub redirects to the new name -CalmCampus
cd CalmCampus && git checkout epfl-web-demo
cd web && npm run check && npm test && npm run build        # needs Node 20+; no npm install needed
npm run dev                                                 # http://localhost:8080  (EPFL at /epfl/)
```

Branch `epfl-web-demo` is not merged into `main` yet. If SSH to GitHub fails, push over HTTPS (`gh auth login`, then `git push https://github.com/lumenworksco/CalmCampus.git <branch>`).

## First message to paste into the new session

"Read web/HANDOFF.md and web/README.md on branch epfl-web-demo. Continue with the 'Still to do' list (the preview is live and complete; next is the real-device test, then the email to EPFL). Ask me before pushing or publishing anything."

Written 2026-11-13, last updated 2026-11-13. Read this, then `web/README.md` and the repo `CLAUDE.md`. This repo is public: keep names of people at partner universities and anything they told us in confidence out of it.

**Branches.** This branch is `main` plus what is EPFL-specific: `config/universities/epfl.json`, `config/qr/epfl.svg`, `test/epfl.test.mjs` and this file. Make app changes on `main`, then merge `main` into this branch; never merge this branch into `main`. Do not add the "Co-Authored-By" trailer to commits.

## Goal

Let EPFL's student services (Consultation sociale) try a preview on their own phones for a few days and review it with colleagues and the student association AGEPoly. This is a reviewer preview, not a pilot: no real student data, no analytics. Every future university should be a config file, not a code change.

Team: Florian Braun and Helene David. CalmCampus is not medical: it does not diagnose or treat, it helps students notice early signs and points them to the right campus support.

## Done

- `web/` is a PWA in vanilla JS with no runtime dependencies. One JSON config per university in `web/config/universities/` (`default`, `epfl`).
- Reviewer preview (`"preview": true`): welcome screen on first open (what this is, how to add it to the home screen, step by step for iPhone and Android; on a computer, a QR code to the phone link), example weeks and example phone data always on and labelled Example, four tabs (Home, My weeks, Support, About). About has "Things to try", "Every possible result" (each level, its yes-count range, the service it suggests), language, feedback, privacy, Start over and the build version.
- Weekly check-in: four yes/no questions from the config, each skippable, with Yes / No / Skip pinned at the bottom. A double tap answers one question only; the whole check-in is one step in the browser history, so the phone's back button never lands in a finished check-in, and a question never shows before the earlier ones are answered.
- Example phone signals (`src/lib/signals.js`): sleep, phone use after midnight and steps against the student's usual, three example weeks (calm, exams, difficult). Questions with a notable signal come first and say what the phone noticed; questions whose signal looks usual say so; questions with no signal say that only the student can tell. A result keeps the example week it was done with. Signals never answer a question or change the level. Which signal belongs to which question is `signals` on each question in the config.
- Result: level, what the student noticed (and how many questions were skipped), what the phone noticed, one next step (a service from the config), emergency numbers, the disclaimer always visible.
- Feedback: a prepared email to contact@calm.braunf.com (subject per language from the config, a few neutral prompts, nothing from the app attached).
- Text: typographic apostrophes, French spacing before ? ! ; :, no line break inside numbers, phone numbers or "24 h/24" (`typography()` in `src/lib/i18n.js`, applied at display time). French uses "l'EPFL" in sentences (`nameInText` in the config).
- Privacy: answers only in `localStorage` (keys start with `cc:`), privacy screen in plain words ("design principles", not "certified"), nothing loaded from other hosts (fonts and Lucide icons bundled, CSP `connect-src 'self'`).
- PWA: per-folder manifest and service worker, offline shell, icons. Installed apps update themselves (fetch past the HTTP cache, reload once the new version is ready, never during a check-in).
- Interaction: taps that change the current screen keep the tapped section in place; tabs remember their scroll position; colours pass WCAG AA contrast.
- Guide for reviewers: "Things to try" in About ticks off what was done (stored on the device), the result suggests the next thing to try, and Home offers to redo the check-in after another example week is picked. The top line says "What to try".
- Checks: `npm run check`, `npm test` (25 unit tests, 3 of them EPFL-specific in `test/epfl.test.mjs`), `npm run build`, and `npm run e2e` (179 end-to-end checks in WebKit on iPhone SE and iPhone 14, Chromium on Pixel 7 and a desktop window, plus offline; expected texts come from the config). CI runs all of them (`.github/workflows/ci.yml`, job `web`).
- EPFL facts verified on epfl.ch and chuv.ch on 2026-11-13 (source URL stored per entry in the config); all links return 200. Emails live in the page source behind email protection, so decode them from the raw HTML.

## Still to do

1. ~~Deploy.~~ **Done.** Live at `https://cc.braunf.com/epfl/` (copied from `web/dist/epfl/` to `docs/epfl/` in `_CalmWeb`). To update: `npm run build`, `rsync -a --delete dist/epfl/ ../../_CalmWeb/docs/epfl/`, run `python3 scripts/check-site.py` there, commit, push. Then `E2E_URL=https://cc.braunf.com/epfl/ npm run e2e` checks the live copy.
2. ~~Fill the TODOs in `epfl.json`.~~ **Done.** Neither service publishes a phone number or opening hours (both are reached by email; the CHUV says students book directly); recorded as `notPublished`. The Student Services desk number (021 693 43 45) is deliberately not used. Still open: the logo (text placeholder until EPFL gives permission). Worth asking the Consultation sociale whether they want a phone number or hours shown.
3. **EPFL review of product choices.** Not reviewed by EPFL yet. Checked against EPFL's and CHUV's own pages and kept as they are:
   - Routing: 1-2 yes to Consultation sociale, 3-4 yes to the CHUV psychotherapeutic consultation. The CHUV page is for students whose study difficulties or low mood "put them in crisis" and lets them book directly; Consultation sociale presents itself as the first stop and refers on. Still the most sensitive choice; one line per level in `levels`.
   - A steady result points to the support list, not to a service.
   - The four question wordings (sleep, planning, getting started, avoiding).
   - French uses "tu"; EPFL's own pages use "vous". Kept "tu" because `src/i18n/fr.json` is shared by every university; switching per university needs a register option in the code.
   Ask these four in the email to EPFL.
4. ~~Re-verify EPFL details.~~ **Done 2026-11-13.** Repeat if the email goes out after about a week, since EPFL is restructuring these pages.
5. **Test on real devices** (iPhone Safari and Android Chrome): delete the old icon, open the link, follow the welcome screen, check the version at the bottom of About.
6. **Email to EPFL.** The "What to test" text is below; the welcome screen and About > Things to try guide the rest. Add the four review questions from step 3.
7. Optional: in Cloudflare, turn off Network Error Logging for cc.braunf.com (it sends browser error reports to Cloudflare); add a language beyond FR/EN. Keep this branch current by merging `main` into it.

## What to test (paste into the email)

1. Open https://cc.braunf.com/epfl/ on your phone, in Safari (iPhone) or Chrome (Android). On a computer, the page shows a QR code to scan with the phone.
2. Follow the first screen to add it to your home screen, then open it only from its icon.
3. Tap "Start the preview", then follow "What to try" at the top of the screen. It ticks off each step and takes about five minutes.
4. Do the weekly check-in: four yes or no questions, each one can be skipped. The example phone data (sleep, steps, late phone use) decides which question comes first.
5. On Home, pick another example week (calm, exams, difficult) and do the check-in again to see the questions adapt.
6. About > See every possible result: each result, how many yes answers lead to it, and which service it suggests. Does each next step feel right?
7. Switch between Français and English. Send feedback from About (opens a prepared email, nothing attached). Start over clears your answers.

## Known limitations

- iPhone: Safari and the installed app have separate storage.
- Clearing browser data deletes answers; nothing is backed up, by design.
- No sync between devices.
- GitHub Pages and Cloudflare keep ordinary request logs; the privacy screen says so.
- The labelled examples in a preview build are the one allowed place for made-up data (exception to the "no synthetic data" rule in `CLAUDE.md`).
- Passive sensing is simulated: a browser cannot read Apple Health, Screen Time or Health Connect. The native iOS app (`ios/`) reads sleep and steps for real; sending it to EPFL needs the paid Apple Developer Program (TestFlight).

## Commands

```bash
cd web
npm run check   # configs and strings
npm test        # unit tests
npm run build   # check + build dist/ (default at root, dist/epfl/ for EPFL)
npm run dev     # build and serve at http://localhost:8080 (EPFL at /epfl/)
npm run e2e     # end to end (needs: npm i --no-save playwright && npx playwright install webkit chromium)
```

Rules to keep: never change a question `id` (bump `version` when wording changes); no exclamation marks, emoji, or clinical words ("at-risk", "disorder"); the product name is always "CalmCampus"; no screeners or self-harm questions; nothing sends answers off the device.
