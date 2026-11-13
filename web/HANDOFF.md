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

"Read web/HANDOFF.md and web/README.md on branch epfl-web-demo. Continue with the 'Still to do' list (steps 1, 2 and 4 are done; next is the real-device test, then the email to EPFL). Ask me before pushing or publishing anything."

Written 2026-11-13, last updated 2026-11-13, so work can continue from another machine or Claude account. Read this, then `web/README.md` and the repo `CLAUDE.md`.

## Goal

Send EPFL (Rodrigue Ambara, Consultation sociale) a demo to test on his own phone for a few days and review with colleagues and the student association AGEPoly. EPFL says students reach their service too late, and they are dropping Trust Point. This is a reviewer demo, not a pilot: no real student data, no analytics. Every future university should be a config file, not a code change.

Team: Florian Braun and Helene David. CalmCampus is not medical: it does not diagnose or treat, it helps students notice early signs and points them to the right campus support.

## Done

- `web/` is a PWA in vanilla JS with no runtime dependencies. One JSON config per university in `web/config/universities/` (`default`, `epfl`).
- Selecting a university: folder (`dist/epfl/`) or `?u=epfl`. Language: browser language, FR/EN button, or `?lang=`.
- Weekly check-in: four yes/no questions in config (localised), result screen with one next step from config, the required disclaimer always visible, and an emergency block on every result.
- Privacy: answers only in `localStorage` (keys start with `cc:`), Start over (Delete my data outside preview builds), privacy screen in plain words ("design principles", not "certified"), no third-party requests (fonts and Lucide icons bundled, CSP `connect-src 'self'`).
- Reviewer preview (`"preview": true` in the config, on for EPFL and default): a welcome screen on first open (what this is, language, how to install), example weeks and example phone data always on and labelled Example, four tabs (Home, My weeks, Support, About). About has "Things to try", "See every possible result" (each level, its yes-count range and the service it suggests) and Start over. Without the flag the older Demo mode toggle is used.
- Example phone signals (`src/lib/signals.js`, only with example data): a "This week on your phone" card with sleep, phone use after midnight and steps against the student's usual, three example weeks (calm, exams, difficult). Questions with a notable signal come first and show what the phone noticed; the result lists it too. Signals never answer a question or change the level; the result comes from the answers alone. Which signal belongs to which question is `signals` on each question in the config. A browser cannot read Apple Health or Screen Time, so the web version only simulates; the native iOS app reads sleep and steps for real (`ios/CalmCampus/Sensing/`).
- "Send feedback": mailto to contact@calm.braunf.com, subject from config, nothing attached.
- Brand: cream/sand/terracotta/sage/ink, Caprasimo and Figtree, Lucide icons at stroke 2.75. Text accents use darker tints (`--terracotta-deep`, `--sage-deep`) for contrast.
- PWA: per-folder manifest and service worker, offline shell, icons. Caches are prefixed per university so folders do not delete each other's caches. Installed apps update themselves (fetch past the HTTP cache, reload once the new version is ready, never during a check-in); the build version is shown at the bottom of About.
- Interaction: taps that change the current screen keep the tapped section in place; tabs remember their scroll position; Yes/No and the welcome Start button are pinned in the bottom dock.
- Checks: `npm run check` (FR/EN parity, placeholders, references, signals, contact formats, voice lint), `npm test` (16 tests), `npm run build`. Also run end to end in emulated iPhone SE, iPhone 14 (WebKit) and Pixel 7 (Chromium) with Playwright (126 checks: welcome, language, example weeks, check-in order, result, My weeks, Support, About, every result, privacy, Start over, scroll position, no external hosts, no horizontal overflow; plus an update test with a 4-hour cache header). Those scripts are not in the repo.
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
5. **Test on real devices** (iPhone Safari and Android Chrome). Florian tried an earlier version on his phone (found the delete and scroll bugs, since fixed). The current reviewer preview needs a pass on a real iPhone and a real Android phone: delete the old icon, add it again, check the version at the bottom of About.
6. **Email to EPFL.** The "What to test" text is below; the app's welcome screen and About > Things to try guide the rest. Add the four review questions from step 3.
7. Optional, not requested: put the Playwright check script in the repo; add a language beyond FR/EN.

## What to test (paste into the email)

1. Open https://cc.braunf.com/epfl/ in Safari (iPhone) or Chrome (Android). The first screen explains how to add it to the home screen. After that, open it only from its icon.
2. Tap Start, then follow "Things to try" in the About tab. It covers everything below and takes about five minutes.
3. Do the weekly check-in: four yes or no questions. The example phone data (sleep, steps, late phone use) decides which question comes first and shows what the phone noticed.
4. On Home, pick another example week (calm, exams, difficult) and do the check-in again to see the questions adapt.
5. About > See every possible result: each result, how many yes answers lead to it, and which service it suggests. Does each next step feel right?
6. Switch between Français and English. Send feedback from About (opens an email draft, nothing attached). Start over clears your answers.

## Known limitations

- iPhone: Safari and the installed app have separate storage.
- Clearing browser data deletes answers; nothing is backed up, by design.
- No sync between devices.
- GitHub Pages keeps ordinary request logs; the privacy screen says so.
- The labelled examples in a preview build are the one allowed place for made-up data (exception to the "no synthetic data" rule in `CLAUDE.md`).
- Passive sensing is simulated: a browser cannot read Apple Health, Screen Time or Health Connect. The native iOS app (`ios/`) reads sleep and steps for real; sending it to EPFL needs the paid Apple Developer Program (TestFlight).

## Commands

```bash
cd web
npm run check   # configs and strings
npm test        # unit tests
npm run build   # check + build dist/ (default at root, dist/epfl/ for EPFL)
npm run dev     # build and serve at http://localhost:8080 (EPFL at /epfl/)
```

Rules to keep: never change a question `id` (bump `version` when wording changes); no exclamation marks, emoji, or clinical words ("at-risk", "disorder"); the product name is always "CalmCampus"; no screeners or self-harm questions; nothing sends answers off the device.
