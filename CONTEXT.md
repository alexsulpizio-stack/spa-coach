# Spa Coach — Context

**What it is:** A local-first hot-tub maintenance and water-care app, built around an Intex PureSpa SB-H10 (6-person, chlorine) but moving toward user-configurable chemical management.

**Repo:** `alexsulpizio-stack/spa-coach`

**Core loop:** test water → interpret → one clear next action → retest/remind → maintain over time.

> **Guiding principle:** Spa Coach should know enough chemistry to give an ordinary owner one clear, safe next action without requiring them to become a water-chemistry expert.

See `AGENTS.md` for working conventions.

---

## State

**Latest confirmed merge to `main`:** v0.9.12 / Android versionCode 102 (PR #19, "Define chemical inventory fields for users").

⚠️ **The v0.9.12 APK had not appeared in Actions at last check — last published build was v0.9.11.** Check Actions and Releases before assuming it shipped.

**Android config:** compileSdk 37, targetSdk 37, minSdk 26, Java 17.

**OTA security:** HTTPS, signed update manifest, SHA-256 APK verification, app identity/signature validation, max download-size check.

**Infrastructure already in place:** unit tests, Playwright E2E, axe accessibility tests, Android tests, CI, signed APK production, state migration and backup, scanner regression tests. The debt here is product complexity, not engineering foundation.

A separate **Strip Reader** shares the scanner logic and has a generic chemistry mode.

---

## Direction

Audit conclusion: **improve the existing product, don't redesign it.** The interaction model is strong. The work is making it easier for an ordinary owner without exposing chemistry configuration.

**v0.10 — Personalization.** Chemical setup wizard, generic defaults for *new* users, better package/quantity modeling, clearer inventory, maintenance start dates. "1 container" is ambiguous — likely needs `packageSize` / `packageUnit` / `remainingAmount`, which means a schema migration. Not started.

**v0.11 — Accuracy.** Real-strip calibration dataset, confidence explanations, chemistry verification, retake guidance.

**v0.12 — Coaching.** Today checklist, trends, recurring-problem detection, context-aware reminders. Progressive disclosure: *Test water* → *Chlorine is low* → *Add [dose]* → *Retest at [time]*, with configuration behind that.

**v1.0 — Hardening.** Refactor `source/app.js` (carries heavy UI orchestration), broader device testing, full accessibility pass, migration tests, docs cleanup.

---

## Chemistry

`source/lib/chemistry.js`. Current classification — free chlorine bad below 3 or above 10; pH bad below 7.0 or above 7.8, caution below 7.2; alkalinity caution below 80 or above 140; hardness caution below 100 or above 500; CYA good at 0 or 30–50.

`evaluateSafety()` blocks use on FC <3 or >10, pH <7.0 or >7.8. Otherwise reports **"WATER IS IN THE USE RANGE."**

**Decision: do not tighten the chlorine range to Intex's published 2–4 ppm.** That was considered and explicitly rejected as too tight. Keep the Intex figure as manufacturer reference only. Any future safety-threshold change gets researched against authoritative sources and discussed before implementation — never inferred from an audit.

**Product assumptions to remove.** Treatment logic currently names specific brands: Leisure Time Spa 56, 1-inch chlorine tablets, Leisure Time Spa Up, SpaChoice pH Decreaser, AquaDoc Chlorine Neutralizer. Doses use `dosePer500` scaled by gallons/500. FC >10 offers a conservative half-dose neutralizer; FC <3 recommends Spa 56 then tablets; pH >7.8 starts at a fixed 0.5 oz; pH <7.2 scales the increaser.

Target architecture: treatment driven by **chemical purpose/type plus user-entered label instructions**, not brand names. **Existing users' configured inventory must survive that transition intact.**

---

## State model

`source/lib/state.js`, schema version 1. Default profile: My PureSpa, 290 gal, chlorine. Inventory fields: `id`, `name`, `purpose`, `quantity`, `unit`, `lowAt`, `dosePer500`. Maintenance defaults: filter 7 days, drain 90, replacement 90. History capped at 200 entries, scanner calibrations at 72.

---

## Scanner

`source/lib/scanner.js` reads hardness, total chlorine, free chlorine, pH, alkalinity, CYA. Uses hard-coded RGB reference values with wet prototypes and wet-darkened chart steps; comparison via CIEDE2000.

**Glare detection** (v0.9.10) rejects compromised readings. The detector uses `usableSupport` rather than saturation-based `colorSupport`, so pale low-free-chlorine swatches still pass, with an upper glare-ratio bound of ≤ .65.

**Biggest accuracy opportunity:** calibrate against real photographed strips and known reference samples instead of manually defined RGB references.

**Confidence should explain itself** — glare, weak pad detection, color falling between reference values, poor strip geometry, capture quality — rather than just reporting a number.

---

## Reminders

v0.9.11 made Android scheduling reliable: exact alarms where Android permits, `setAndAllowWhileIdle` fallback, `SCHEDULE_EXACT_ALARM`, one-time special-access prompt, scheduler-mode tests. **Do not regress to relying only on a deferrable alarm.**

Troubleshooting order: Settings → SEND TEST NOTIFICATION; if that fails, check the `spa_retests` notification channel; if immediate works but scheduled doesn't, check exact-alarm special access and scheduler mode.

**Onboarding weakness:** in `source/lib/reminders.js`, a maintenance action with no `lastDone` bases its due date on the current time while the UI says "Not started." Setup should ask when the spa was last filled, and when the filter was last cleaned and replaced.

---

## Constraints

- **Local-first.** Don't introduce a required cloud dependency.
- **Existing user data survives upgrades.** Changing defaults affects fresh installs; it never overwrites a configured inventory.
- **Photo workflow must not regress:** upload and analyze strips, choose an existing photo (and actually see photos), save locally, back up or change the selected pad, no mandatory 15-second timer.
- **Release pipeline:** don't restore the old workflow ordering that validated a stale `update.json` before OTA prep — that broke the v0.9.9 release.

---

## Open work

1. Confirm whether the v0.9.12 APK published; if the pipeline failed, fix it.
2. Start v0.10 personalization — as several small PRs, not one large change.
3. Remove brand assumptions from chemistry, preserving existing inventory.
4. Real-strip scanner calibration; explain uncertainty to the user.
5. Today/checklist home experience; trends and recurring-problem detection.
6. Maintenance onboarding with real last-service dates.
7. Refactor `source/app.js`.
8. **Stale docs:** `source/README.md` still says "Spa Coach PHONE v0.9.8" and claims reminders deliberately avoid exact-alarm privileges — untrue since v0.9.11.
