# CalmCampus — Student Wellness App

**Status (Sept 2026):** migrating from Flutter to native apps — SwiftUI on iOS first, then Kotlin/Compose on Android. The Flutter app was removed from `main`; it lives at git tag `flutter-final` and is the reference for UI, exercise content, and scoring logic (`git show flutter-final:lib/data/interventions_data.dart`).

## Layout

- `ios/` — the real iOS app (SwiftUI + SwiftData, XcodeGen). First feature: the adaptive daily check-in (`CalmCampus/Checkin/`): wording in `QuestionBank`, rules in `CheckinPlanner` (pure, unit-tested), answers stored as flat versioned rows (`Data/CheckinResponse`).
- `web/` — reviewer-preview PWA (vanilla JS, no runtime deps), one JSON config per university in `web/config/universities/`. `cd web && npm run check && npm test && npm run build`, then `npm run e2e` (Playwright end to end; set `E2E_URL` to check a live copy). See `web/README.md`. **Branches:** `main` holds the general preview (`default` config only). Each university has its own branch `<id>-web-demo`, made from `main`, that only adds its config, QR code, `test/<id>.test.mjs` and `web/HANDOFF.md`; make app changes on `main` and merge `main` into the university branches, never the other way. A university's preview is deployed from its branch by copying `web/dist/<id>/` into `docs/<id>/` of the `_CalmWeb` repo (never all of `dist/`). A preview build (`"preview": true`) always shows example weeks and example phone data, labelled Example and kept under a separate storage key: the only place made-up data appears. Phone signals there only order the questions and add context; they never change the result.
- `spike/` — throwaway iOS feasibility spike (what sensor data iOS actually gives us). See `spike/README.md`.
- `ml/` — fine-tuned on-device reframing model (data, MLX training, eval, `MODEL_CARD.md`). See `ml/README.md`; weights live on Hugging Face ([CalmCampus](https://huggingface.co/CalmCampus)), not in git; `ml/publish_hf.py` publishes them. Downloading the public weights to run on the device is fine; sending user text to any inference API (including Hugging Face's) is not.
- `design/mockups/` — HTML mockups of the app screens; `design/brand/` — app icon, palette.

## Commands

```bash
cd ios && xcodegen generate && open -a Xcode CalmCampus.xcodeproj         # the app (needs full Xcode)
xcodebuild test -project ios/CalmCampus.xcodeproj -scheme CalmCampus \
  -destination 'platform=iOS Simulator,name=CC Test iPhone'             # unit tests
cd spike && xcodegen generate && open -a Xcode CalmCampusSpike.xcodeproj
# compile check without signing:
xcodebuild -project spike/CalmCampusSpike.xcodeproj -scheme CalmCampusSpike \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

`.xcodeproj` files are generated from `project.yml` (XcodeGen) and gitignored — edit `project.yml`, not the project.

## Principles

- **All data stays on-device.** No cloud AI or analytics. On-device AI only (Apple Foundation Models / Gemini Nano). The Flutter version sent user text to Groq — do not reintroduce that.
- **No synthetic data in the product.** Every signal is real, missing, or unavailable; never fabricated. Only exception: the labelled examples in the web reviewer preview.
- **Check-in questions:** never change a question `id`; bump `version` when wording/options change. No clinical screeners (PHQ/GAD, scored cutoffs) or self-harm items. Keep the burden budget (3 core + sleep fallback + ≤2 extra), every question skippable.
- **Wellness wording, not medical claims** ("supports", not "detects burnout") — EU MDR risk.
