# CalmCampus web preview (PWA)

A reviewer preview of CalmCampus that runs in any phone or desktop browser and installs to the home screen. It is built for non-technical reviewers at a university (student services, student associations): they open a link, add it to the home screen and try it for a few days. No account, no backend, no analytics. Answers live in the browser's local storage on the device and are never sent anywhere.

Live for EPFL at **https://cc.braunf.com/epfl/**.

Each university is one JSON file in `config/universities/`. Adding a university is a config change, not a code change.

```bash
cd web
npm run check     # validates every config and string file (FR/EN parity, voice, references)
npm test          # unit tests: scoring, weeks, storage, example data, phone signals, language, config
npm run build     # check + build into dist/ (default at the root, one folder per university)
npm run dev       # build and serve dist/ at http://localhost:8080 (EPFL at /epfl/)
```

Node 20+. No `npm install` is needed to build or run. Playwright is only used by `scripts/make-icons.mjs` and for end-to-end checks run outside the repo.

## What a reviewer sees

- **Welcome** on first open: what the preview is and (when opened in the browser instead of the installed app) how to add it to the home screen. The language switch sits in the header on every screen; About also has a full Français / English choice.
- **Home**: the weekly check-in (four yes or no questions) and "This week on your phone": example sleep, phone use after midnight and steps, each compared with the student's usual week. Three example weeks (calm, exams, difficult) show how the check-in adapts.
- **Check-in**: questions with a notable phone signal come first and say what the phone noticed. Questions no phone signal can measure say so. Yes and No stay pinned at the bottom.
- **Result**: the level, what the student noticed, what the phone noticed, one next step (a service from the config) and the emergency numbers.
- **My weeks**: the history. The earlier weeks are examples, labelled as such.
- **Support**: every service from the config and the emergency numbers.
- **About**: "Things to try" (a five-step guide), "See every possible result" (each level, the number of yes answers that leads to it and the service it suggests), language, feedback, privacy, Start over, and the build version.

Phone signals never answer a question and never change the result: the level comes from the student's answers alone. They only decide which question comes first and what context is shown. A browser cannot read Apple Health, Screen Time or Health Connect, so the web preview uses examples; the native iOS app in `../ios/` reads sleep and steps for real.

## Choosing a university

- Folder: `dist/epfl/` opens EPFL, `dist/` opens the default setup.
- URL: `?u=epfl` on any folder overrides it. `?lang=en` or `?lang=fr` picks the language.
- `?demo=1` / `?demo=0` turn the example data on or off, only for a university without `"preview": true`. A preview build always shows the examples.
- Build one only: `node scripts/build.mjs --only epfl`

## How to add a university in 15 minutes

1. Copy `config/universities/default.json` to `config/universities/<id>.json`. The file name, without `.json`, is the id and the folder name (`/<id>/`).
2. Set `name`, `languages` and `defaultLanguage`. Every language listed needs a file in `src/i18n/` (English and French exist). Keep `"preview": true` for a reviewer preview. Optional: `logo.text`, or `logo.image` once you have permission to use the logo.
3. Translate the four `questions` into every language. Never change a question `id` later. Bump its `version` when the wording changes. Each question can list `signals` (`sleep`, `lateScreen`, `steps`): the phone signals that belong to it.
4. Fill in `services`: for each one a `name`, a `purpose` and `contact` (`link` per language, `email`, `phone`, `hours`). Use `null` for anything you do not know and list it in `todo`. If the university's pages do not publish it at all (for example a service reached only by email), list it in `notPublished` with where you looked instead: no warning, and the app simply leaves it out. Copy details only from the university's own pages, and put that page in `source` and today's date in `verified`.
5. Fill in `emergency`: the campus emergency number first, then national lines. `number` is what people read, `tel` is what the phone dials.
6. Point each entry in `levels` at a service with `service` (`null` points to the support list). `minYes` is how many of the four answers must be yes for that level. The default is `0 steady`, `1 notice`, `2 support`, `3 care`.
7. Set `feedback.email` and `feedback.subject`.
8. Run `npm run check`. It fails on a missing translation, an unknown service or signal, a bad email or link, an exclamation mark, an emoji, or a clinical word such as "disorder". TODOs show up as warnings.
9. Run `npm run dev`, open `http://localhost:8080/<id>/` and go through About > Things to try, including every result.
10. Deploy (below).

Checklist before sending to a university: every `todo` is resolved or accepted, a staff member there has confirmed the service details, and the contact email in `feedback` is one you read.

## Deploying to cc.braunf.com

The site is GitHub Pages from `docs/` in the [`_CalmWeb`](https://github.com/lumenworksco/_CalmWeb) repo. Copy only the university's folder, never all of `dist/` (that would overwrite the site root):

```bash
cd web && npm run build
rsync -a --delete dist/epfl/ ../../_CalmWeb/docs/epfl/
cd ../../_CalmWeb && python3 scripts/check-site.py
git add docs/epfl && git commit -m "EPFL preview: <what changed>" && git push origin main
```

Pages publishes within a minute or two. Installed apps update themselves: the service worker fetches the new files past the browser cache, and the page reloads once the new version is ready (never during a check-in). The build version is shown at the bottom of About, so a tester can tell which build a phone runs.

## Privacy design

- Answers are stored in `localStorage` under keys that start with `cc:`. Start over (or Delete my data, outside preview builds) removes all of them.
- The app makes no request to any other origin. Fonts (Caprasimo, Figtree, both SIL OFL) and Lucide icons are bundled. A Content Security Policy in `index.html` (`connect-src 'self'`) enforces this in the browser.
- The only network traffic is loading the app files from the host. The host can keep ordinary request logs; the privacy screen says so. Choose a host with analytics off.
- Example weeks are written to their own key (`cc:<id>:demo`) and carry `demo: true`; the student's own check-ins never get that flag. Examples and example phone data are always labelled Example. This is the one place the product shows made-up data, as an exception to the "no synthetic data" rule, so a reviewer can see trends, adaptation and every result without waiting weeks.
- "Send feedback" opens a `mailto:` draft. Nothing is attached.

## Hosting elsewhere

`dist/` is plain static files. Every folder is a complete app with its own manifest and service worker, using relative paths, so it works under any path.

- Any static host works: Cloudflare Pages, Netlify, GitHub Pages, or a folder in an existing site repo.
- Serve over HTTPS (required for install and offline).
- `dist/_headers` sets no-cache on the service worker and a few safe headers on hosts that read the Netlify/Cloudflare format. GitHub Pages ignores it, which is why the service worker bypasses the HTTP cache itself.

## Known limitations

- On iPhone, Safari and the installed home-screen app have separate storage. Install first, then use the app only from its icon. The welcome screen says how.
- Clearing browser data deletes the answers. They are not backed up anywhere, by design.
- Answers are not shared between a phone and a laptop.
- The EPFL logo is not included. The header shows a text placeholder.
- EPFL service details were checked against epfl.ch and chuv.ch on 2026-11-13 and should be re-checked before each release. Neither service publishes a phone number or opening hours (both are reached by email), so those stay empty.
- Checked end to end in emulated iPhone SE, iPhone 14 (WebKit) and Pixel 7 (Chromium). An earlier version was tried on a real phone; the current one still needs a real iPhone and Android pass.
