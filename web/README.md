# CalmCampus web demo (PWA)

A reviewer demo of CalmCampus that runs in any phone or desktop browser and installs to the home screen. No account, no backend, no analytics. Answers live in the browser's local storage on the device and are never sent anywhere.

Each university is one JSON file in `config/universities/`. Adding a university is a config change, not a code change.

```bash
cd web
npm run check     # validates every config and string file (FR/EN parity, voice, references)
npm test          # unit tests for scoring, weeks, storage, demo data, language and config selection
npm run build     # check + build into dist/ (default at the root, one folder per university)
npm run dev       # build and serve dist/ at http://localhost:8080 (EPFL at /epfl/)
```

No dependencies are needed to build or run. Playwright is only used by `scripts/make-icons.mjs` and was only used for the screenshot checks.

## Choosing a university

- Folder: `dist/epfl/` opens EPFL, `dist/` opens the default setup.
- URL: `?u=epfl` on any folder overrides it. `?lang=en` or `?lang=fr` picks the language, `?demo=1` turns on demo mode, `?demo=0` turns it off.
- Build one only: `node scripts/build.mjs --only epfl`

## How to add a university in 15 minutes

1. Copy `config/universities/default.json` to `config/universities/<id>.json`. The file name, without `.json`, is the id and the folder name (`/<id>/`).
2. Set `name`, `languages` and `defaultLanguage`. Every language listed needs a file in `src/i18n/` (English and French exist). Optional: `logo.text`, or `logo.image` once you have permission to use the logo.
3. Translate the four `questions` into every language. Never change a question `id` later. Bump its `version` when the wording changes.
4. Fill in `services`: for each one a `name`, a `purpose` and `contact` (`link` per language, `email`, `phone`, `hours`). Use `null` for anything you do not know and list it in `todo`. If the university's pages do not publish it at all (for example a service reached only by email), list it in `notPublished` with where you looked instead: no warning, and the app simply leaves it out. Copy details only from the university's own pages, and put that page in `source` and today's date in `verified`.
5. Fill in `emergency`: the campus emergency number first, then national lines. `number` is what people read, `tel` is what the phone dials.
6. Point each entry in `levels` at a service with `service`. `minYes` is how many of the four answers must be yes for that level. The default is `0 steady`, `1 notice`, `2 support`, `3 care`.
7. Run `npm run check`. It fails on a missing translation, an unknown service, a bad email or link, an exclamation mark, an emoji, or a clinical word such as "disorder". TODOs show up as warnings.
8. Run `npm run dev` and open `http://localhost:8080/<id>/`. Check the result screen at every level (turn on `?demo=1`, then "Preview every result").
9. `npm run build` and upload `dist/<id>/` to your host.

Checklist before sending to a university: every `todo` is resolved or accepted, a staff member there has confirmed the service details, and the contact email in `feedback` is one you read.

## Privacy design

- Answers are stored in `localStorage` under keys that start with `cc:`. "Delete my data" removes all of them.
- The app makes no request to any other origin. Fonts (Caprasimo, Figtree, both SIL OFL) and Lucide icons are bundled. A Content Security Policy in `index.html` (`connect-src 'self'`) enforces this in the browser.
- The only network traffic is loading the app files from the host. The host can keep ordinary request logs. Choose one with analytics off.
- Demo mode writes made-up weeks to a separate key (`cc:<id>:demo`). Real answers are never mixed with them, and turning demo mode off deletes the made-up weeks. This is the one place the product shows non-real data, and it is always labelled "Demo data". It exists so a reviewer can see trends and every result level without waiting weeks.
- "Send feedback" opens a `mailto:` draft. Nothing is attached.

## Hosting

`dist/` is plain static files. Every folder is a complete app with its own manifest and service worker, using relative paths, so it works under any path such as `https://cc.braunf.com/epfl/`.

- Any static host works: Cloudflare Pages, Netlify, GitHub Pages, or a folder in an existing site repo.
- Serve over HTTPS (required for install and offline).
- `dist/_headers` sets no-cache on the service worker and a few safe headers on hosts that read the Netlify/Cloudflare format.
- Turn off host analytics (for example Cloudflare Web Analytics).

## Known limitations

- On iPhone, Safari and the installed home-screen app have separate storage. Install first, then use the app only from its icon.
- Clearing browser data deletes the answers. They are not backed up anywhere, by design.
- Answers are not shared between a phone and a laptop.
- The EPFL logo is not included. The header shows a text placeholder.
- Service details were checked against epfl.ch and chuv.ch on 2026-11-12 and should be re-checked before each release. Phone numbers and opening hours for the two EPFL services are not on those pages and are left empty.
- It has been checked in emulated iPhone (WebKit) and Pixel (Chromium) browsers, not on physical devices.
