# Handoff: Quivr reviewer preview (web/)

> **For the next Claude session.** Self-contained. Read it, then `web/README.md` and the repo `CLAUDE.md`. Do not email or contact anyone.

Written 2026-11-14. Made by Florian Braùn and Hélène David.

## What this is, and what it is not

A reviewer preview of CalmCampus made for Quivr (the Flemish student app by Student Innovations vzw) to look at. It is **not a Quivr feature, there is no pilot, and Quivr has not agreed to anything**. The app says so on the welcome screen and on the Quivr view ("Mockup: how this could look in Quivr, not a live Quivr feature"). Never claim a pilot, results, users, awards or a partnership in the app, in docs or in commits.

Live at `https://cc.braunf.com/quivr/` (noindex, not linked from the site's home page).

**Branches.** This branch (`quivr-web-demo`) is `main` plus what is Quivr-specific: `config/universities/quivr.json`, `config/qr/quivr.svg`, `test/quivr.test.mjs` and this file. App changes go on `main` (through a feature branch) and are merged from `main` into this branch, never the other way. No "Co-Authored-By" trailer in commits. The repo is public: no names of people at Quivr or at universities, and nothing they told us in confidence beyond what the app already says.

## How it works

- Quivr's students come from several universities, so the config has `institutions`: KU Leuven, KU Leuven Kulak (Kortrijk), UGent, UAntwerpen, VUB, UHasselt, and "Other institution". After Start, the student picks one ("Which university are you at?", stored as `cc:quivr:uni`, changeable in About, asked again after Start over). Each has its own services, routing and campus number; "Other" shows only the national lines and general advice.
- Languages: Dutch (default), English, French. Same four questions and ids as the EPFL preview (sleep, planning, energy, connection), each skippable. Levels: 0 steady (support list), 1 notice, 2 support, 3+ care.
- Quivr view (`#quivr-view`): a plainly generic phone frame labelled Mockup with one CalmCampus card ("Weekly check-in: 4 questions, less than a minute. Private, stays on your phone." / Open), and "What Quivr would do / what we do". Whether Quivr has a card slot or push notifications is written as a question, not a fact.
- For Quivr pages (from About and the Quivr view): What Quivr gets; How we avoid last year's low engagement; Three-week test (every number labelled "Proposed target, to agree with Quivr in advance, not a result"); How we'd measure, privacy-first (design only, nothing built; the example table is labelled Example).
- Guide (About > Things to try), about five minutes: open the Quivr view and tap the card; pick a university; do the check-in; see every possible result; open Support and the emergency numbers; read the test plan. Send feedback stays in About (contact@calm.braunf.com, subject "Feedback on the CalmCampus preview (Quivr)", per language).
- Footer on every screen: "We are students, not medical professionals. CalmCampus does not diagnose or treat; ..." (NL and FR translated). The check-in "takes less than a minute"; `npm run check` refuses any time in seconds.
- Privacy unchanged: no backend, no analytics, nothing leaves the phone, CSP `connect-src 'self'`. The measurement plan is only described.
- No Quivr logo: the header says "voor Quivr-studenten" / "for Quivr students" in text. A logo needs Quivr's permission (`logo.todo`).

## Routing and sources (verified 2026-11-14 on each university's own pages)

| University | 1-2 yes | 3-4 yes | Campus number |
|---|---|---|---|
| KU Leuven | Eerstelijnspsycholoog (Stuvo), 016 32 43 43 | Psycholoog-psychotherapeut (Stuvo), same line | Noodlijn KU Leuven 016 32 22 22 |
| Kulak | Studentenwelzijn en gezondheid (Stuvo Kulak), 056 24 61 38 | same | Noodlijn KU Leuven 016 32 22 22 |
| UGent | Studentenpsychologen, Studentencentrum studentencentrum@ugent.be, +32 9 331 00 31 | same | Permanentie UGent 09 264 88 88 |
| UAntwerpen | Studentenpsychologen (STIP), 03 265 48 72 | same (PSY-NET is listed; STIP refers to it) | none published |
| VUB | Studentenpsychologen, begeleiding@vub.be, +32 2 629 23 06 | same (BRUCC is listed) | Security Etterbeek +32 2 629 11 11 |
| UHasselt | Studentenpsycholoog, studentenpsycholoog@uhasselt.be | same (Student Point is listed) | Fire or accident 011 26 88 88 |
| Other | general advice, national lines | same | none |

National lines (each verified on the operator's own site): 112 (112.be), Zelfmoordlijn 1813, Tele-Onthaal 106, Télé-Accueil 107, Centre de Prévention du Suicide 0800 32 123. Every source URL is in the config (`source`, `sources`), with what is missing in `todo` or `notPublished`.

## Still to do

1. UAntwerpen STIP email: hidden behind a "Toon e-mailadres" button that decodes on the server; copy it by hand from https://www.uantwerpen.be/nl/studeren/hulp-bij-studentenvragen/stip/ (`todo`). STIP hours change per period (`todo`).
2. VUB email: the English "contact a student psychologist" page says guidance@vub.be, both organisation contact pages say begeleiding@vub.be (used). Ask VUB.
3. Not dropped but worth a second look: the Community Help Service English line (its own site prints two different numbers, so it is not in the app).
4. Review choices to ask Quivr and the universities: KU Leuven 3-4 yes to the psychologist-psychotherapist (KU Leuven's page: first-line for mild to moderate, psychotherapist for difficulties that disrupt daily life); every other university routes all levels to its first stop. "KU Leuven" means the Leuven Stuvo services; students on other KU Leuven campuses may have their own.
5. Quivr questions: does Quivr have a card or banner slot, push notifications, or only the news section? Which institutions should the picker list (Quivr's site also names university colleges)? Which test window fits before the exam period? Who approves the card text?
6. Re-verify the services if this goes out more than a week after 2026-11-14.

## Commands

```bash
cd web
npm run check && npm test && npm run build
npm run e2e                                          # local (Quivr: every language, every university, pages, guide)
E2E_URL=https://cc.braunf.com/quivr/ npm run e2e     # live
rsync -a --delete dist/quivr/ ../../_CalmWeb/docs/quivr/   # deploy, then check-site.py, commit, push _CalmWeb
```
