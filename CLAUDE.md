# CalmCampus — Student Wellness App

**Status (Sept 2026):** migrating from Flutter to native apps — SwiftUI on iOS first, then Kotlin/Compose on Android. The Flutter app was removed from `main`; it lives at git tag `flutter-final` and is the reference for UI, exercise content, and scoring logic (`git show flutter-final:lib/data/interventions_data.dart`).

## Layout

- `ios/` — the real iOS app (SwiftUI + SwiftData, XcodeGen). First feature: the adaptive daily check-in (`CalmCampus/Checkin/`): wording in `QuestionBank`, rules in `CheckinPlanner` (pure, unit-tested), answers stored as flat versioned rows (`Data/CheckinResponse`).
- `spike/` — throwaway iOS feasibility spike (what sensor data iOS actually gives us). See `spike/README.md`.
- `ml/` — fine-tuned on-device reframing model (data, MLX training, eval, `MODEL_CARD.md`). See `ml/README.md`; weights live on Hugging Face, not in git.
- The pitch site, impact report and evidence dossier live in their own repo, `calmweb` (cc.braunf.com).
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
- **No synthetic data in the product.** Every signal is real, missing, or unavailable; never fabricated.
- **Check-in questions:** never change a question `id`; bump `version` when wording/options change. No clinical screeners (PHQ/GAD, scored cutoffs) or self-harm items. Keep the burden budget (3 core + sleep fallback + ≤2 extra), every question skippable.
- **Wellness wording, not medical claims** ("supports", not "detects burnout") — EU MDR risk.
