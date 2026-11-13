# CalmCampus web preview (PWA)

A reviewer preview of CalmCampus that runs in any phone or desktop browser and installs to the home screen. It is built for non-technical reviewers at a university (student services, student associations): they open a link, add it to the home screen and try it for a few days. No account, no backend, no analytics. Answers live in the browser's local storage on the device and are never sent anywhere.

Each university is one JSON file in `config/universities/`. Adding a university is a config change, not a code change.

```bash
cd web
npm run check     # validates every config and string file (FR/EN parity, voice, references)
npm test          # unit tests: scoring, weeks, storage, example data, phone signals, language, config
npm run build     # check + build into dist/ (default at the root, one folder per university)
npm run dev       # build and serve dist/ at http://localhost:8080
npm run e2e       # end to end in WebKit and Chromium (phones, a desktop window, offline)
E2E_URL=https://cc.braunf.com/<id>/ npm run e2e     # the same checks against a deployed copy
```

Node 20+. No `npm install` is needed to build or run. Playwright is only needed for `npm run e2e` and `scripts/make-icons.mjs`; install it outside the project's dependencies with `npm i --no-save playwright && npx playwright install webkit chromium`. CI (`.github/workflows/ci.yml`, job `web`) runs check, test, build and e2e.

## Branches: one general version, one branch per university

- `main` holds the general preview: the app and the `default` config ("your university", services without contact details, the European emergency number). It is what any university sees before it has its own version.
- Each university gets its own branch, `<id>-web-demo`, created from `main`. It only adds what is specific to that university: `config/universities/<id>.json`, its QR code in `config/qr/`, `test/<id>.test.mjs` and a `HANDOFF.md` with the state of that pilot. Everything else stays identical to `main`.
- App changes are made on `main` (or a feature branch into `main`) and then merged from `main` into each university branch. A university branch is never merged into `main`.
- `npm run e2e` tests the university of the branch it runs on (the one config besides `default`, else `default`), with every expected text taken from that config.

## What a reviewer sees

- **Welcome** on first open: what CalmCampus is, that this is a preview, and, when opened in the browser instead of the installed app, how to add it to the home screen: numbered steps on iPhone and Android, and on a computer a QR code to the phone link (`publicUrl` and `qr` in the config). The language switch sits in the header on every screen; About also has a full Français / English choice.
- **Home**: the weekly check-in and "This week on your phone": example sleep, phone use after midnight and steps, each compared with the student's usual week. Three example weeks (calm, exams, difficult) show how the check-in adapts; after picking another one, Home offers to redo the check-in.
- **Check-in**: questions with a notable phone signal come first and say what the phone noticed; questions whose signal looks usual, or that no phone signal can measure, say so. Yes, No and Skip stay pinned at the bottom. A double tap answers one question only, and the whole check-in is one step in the browser history, so the phone's back button never returns into a finished check-in.
- **Result**: the level, what the student noticed (and how many questions were skipped), what the phone noticed in the example week the check-in was done with, one next step (a service from the config), the emergency numbers, and in a preview the next thing to try.
- **My weeks**: the history, with the reviewer's own check-ins and the example weeks in separate groups.
- **Support**: every service from the config and the emergency numbers.
- **About**: "Things to try" (a five-step guide that ticks off what the reviewer has done), "Every possible result" (each level, the number of yes answers that leads to it and the service it suggests), language, feedback, privacy, Start over, and the build version.

Phone signals never answer a question and never change the result: the level comes from the student's answers alone. They only decide which question comes first and what context is shown. A browser cannot read Apple Health, Screen Time or Health Connect, so the web preview uses examples; the native iOS app in `../ios/` reads sleep and steps for real.

## Choosing a university

- Folder: `dist/<id>/` opens that university, `dist/` opens the default setup.
- URL: `?u=<id>` on any folder overrides it. `?lang=en` or `?lang=fr` picks the language.
- `?demo=1` / `?demo=0` turn the example data on or off, only for a university without `"preview": true`. A preview build always shows the examples.
- Build one only: `node scripts/build.mjs --only <id>`

## How to add a university in 15 minutes

1. Create the branch: `git switch main && git switch -c <id>-web-demo`.
2. Copy `config/universities/default.json` to `config/universities/<id>.json`. The file name, without `.json`, is the id and the folder name (`/<id>/`).
3. Set `name`, `languages` and `defaultLanguage`. Every language listed needs a file in `src/i18n/` (English and French exist). Set `nameInText` for the name as it reads inside a sentence, with its article where the language needs one (in French, "l'…" or "la …"). Keep `"preview": true` for a reviewer preview. Optional: `logo.text`, or `logo.image` once you have permission to use the logo.
4. Translate the four `questions` into every language. Never change a question `id` later. Bump its `version` when the wording changes. Each question can list `signals` (`sleep`, `lateScreen`, `steps`): the phone signals that belong to it.
5. Fill in `services`: for each one a `name`, a `purpose` and `contact` (`link` per language, `email`, `phone`, `hours`). Use `null` for anything you do not know and list it in `todo`. If the university's pages do not publish it at all (for example a service reached only by email), list it in `notPublished` with where you looked instead: no warning, and the app simply leaves it out. Copy details only from the university's own pages, and put that page in `source` and today's date in `verified`.
6. Fill in `emergency`: the campus emergency number first, then national lines. `number` is what people read, `tel` is what the phone dials.
7. Point each entry in `levels` at a service with `service` (`null` points to the support list). `minYes` is how many of the four answers must be yes for that level. The default is `0 steady`, `1 notice`, `2 support`, `3 care`.
8. Set `feedback.email` and `feedback.subject` (one text, or one per language). For the computer view, set `publicUrl` (the address the preview will have) and `qr` (an SVG QR code of that address in `config/qr/<id>.svg`, made once with any QR tool).
9. Add `test/<id>.test.mjs` for what matters at that university (routing, sources, emergency numbers) and a `HANDOFF.md` for the state of the pilot.
10. Run `npm run check`. It fails on a missing translation, an unknown service or signal, a bad email or link, an exclamation mark, an emoji, or a clinical word such as "disorder". TODOs show up as warnings. Then `npm test`, `npm run build` and `npm run e2e`.
11. Run `npm run dev`, open `http://localhost:8080/<id>/` and go through About > Things to try yourself.
12. Deploy (below).

Checklist before sending to a university: every `todo` is resolved or accepted, a staff member there has confirmed the service details, and the contact email in `feedback` is one you read.

## Deploying to cc.braunf.com

The site is GitHub Pages from `docs/` in the [`_CalmWeb`](https://github.com/lumenworksco/_CalmWeb) repo. From the university's branch, copy only its folder, never all of `dist/` (that would overwrite the site root):

```bash
cd web && npm run build
rsync -a --delete dist/<id>/ ../../_CalmWeb/docs/<id>/
cd ../../_CalmWeb && python3 scripts/check-site.py
git add docs/<id> && git commit -m "<id> preview: <what changed>" && git push origin main
```

Pages publishes within a minute or two; then `E2E_URL=https://cc.braunf.com/<id>/ npm run e2e` checks the live copy. Installed apps update themselves: the service worker fetches the new files past the browser cache, and the page reloads once the new version is ready (never during a check-in). The build version is shown at the bottom of About, so a tester can tell which build a phone runs.

## Privacy design

- Answers are stored in `localStorage` under keys that start with `cc:`. Start over (or Delete my data, outside preview builds) removes all of them.
- The app makes no request to any other origin. Fonts (Caprasimo, Figtree, both SIL OFL) and Lucide icons are bundled. A Content Security Policy in `index.html` (`connect-src 'self'`) enforces this in the browser.
- The only network traffic is loading the app files from the host. The host can keep ordinary request logs; the privacy screen says so. Choose a host with analytics off.
- Example weeks are written to their own key (`cc:<id>:demo`) and carry `demo: true`; the student's own check-ins never get that flag. Examples and example phone data are always labelled Example. This is the one place the product shows made-up data, as an exception to the "no synthetic data" rule, so a reviewer can see trends, adaptation and every result without waiting weeks.
- The guide's progress (`cc:<id>:tried`) only records which preview steps were opened, on the device.
- "Send feedback" opens a `mailto:` draft with a few neutral prompts. Nothing from the app is attached.
- Display text goes through `typography()` (`src/lib/i18n.js`): typographic apostrophes, French spacing before ? ! ; :, and no line break inside numbers, phone numbers or "24 h/24". Links never do.

## Hosting elsewhere

`dist/` is plain static files. Every folder is a complete app with its own manifest and service worker, using relative paths, so it works under any path.

- Any static host works: Cloudflare Pages, Netlify, GitHub Pages, or a folder in an existing site repo.
- Serve over HTTPS (required for install and offline).
- `dist/_headers` sets no-cache on the service worker and a few safe headers on hosts that read the Netlify/Cloudflare format. GitHub Pages ignores it, which is why the service worker bypasses the HTTP cache itself.

## Known limitations

- On iPhone, Safari and the installed home-screen app have separate storage. Install first, then use the app only from its icon. The welcome screen says how.
- Clearing browser data deletes the answers. They are not backed up anywhere, by design.
- Answers are not shared between a phone and a laptop.
- Checked end to end in WebKit (iPhone SE, iPhone 14) and Chromium (Pixel 7, desktop), including offline. Emulators do not replace a pass on a real iPhone and a real Android phone before sending a version to a university.
- cc.braunf.com runs through Cloudflare, which adds Network Error Logging headers: browsers that support it may report failed page loads to Cloudflare. It can be turned off in the Cloudflare dashboard.
