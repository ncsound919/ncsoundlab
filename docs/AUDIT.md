# NC Sound Lab — UI/UX Audit & Deployment Readiness

Date: 2026-08-09 · Scope: full app (web demo + Tauri desktop) · Method: automated (Lighthouse 12, Playwright, tsc, vitest, cargo check) + manual a11y-tree walkthrough of all 9 stages.

## Headline results

| Check | Result |
|---|---|
| Lighthouse Accessibility | **90 / 100** |
| Lighthouse Best Practices | **100 / 100** |
| Lighthouse SEO | **83 / 100** (meta description was missing) |
| Unit tests (vitest) | **698 / 698 pass** (73 files) |
| Type-check (`npm run lint`) | **PASS** (0 errors — was 37) |
| E2E (Playwright) | **PASS** (2/2) |
| Production build (vite) | **PASS** (36s, lazy-loaded, code-split) |
| Main bundle | **500 kB raw / 155 kB gzip** (heavy critical path) |
| Tauri backend (`cargo check --all-targets`) | **PASS** |
| Responsive (390px mobile) | Functional — sidebar hidden, mobile stage switcher present |

## Grade by dimension

| Dimension | Grade | Notes |
|---|---|---|
| Visual design & branding | **A–** | Cohesive royal-blue/gold/mauve hip-hop aesthetic, self-hosted `Fast Blaze` display font, consistent dark glassy panels, animated transitions. Strong, unique identity. |
| Information architecture & navigation | **B+** | 9-stage "Production Pipeline" is a clear linear metaphor; sidebar + mobile stage switcher + keyboard arrows. No router / no deep links (minor). |
| Feedback & state visibility | **A** | Toasts, live meters, clip indicator, undo/redo, A/B snapshots, autosave recovery banner. Exceptionally strong. |
| Accessibility | **C+** | 90 LH score, but: unlabeled `Synth Layer` name input, footer `v5.2-PRO` text at 2.55:1 contrast, duplicate `h2` headings (stage name in header + main), interactive `<button>` nested in a `<summary>`, 2 form fields missing id/name. |
| Onboarding & first-run | **D** | **None.** A new visitor lands inside a dense pro workstation with zero guidance, a stray autosave-recovery banner, and one mystery synth layer. Single worst gap for a demo-to-paid funnel. |
| Performance & responsiveness | **B–** | Good code-splitting + lazy loading; main chunk 500 kB (155 gzip) is heavy; no skeleton loaders for lazy chunks; mobile usable but dense. |
| Monetization integrity | **F** | `Buy & Download Kit ($19.00)` button calls the *same* JSZip download as "Export for External Sale" — **no payment is enforced anywhere**. Paid kits are downloadable for free. |
| Demo-to-purchase funnel | **F** | No demo gating, no timed session, no purchase/download flow, no Tauri-vs-web runtime differentiation (except AAF). |

**Overall UI/UX grade: C+**

## Critical findings

1. **F — Paid content is free.** `SoundKitCatalog.tsx:703-716` — the Buy button (`handleDownloadKit(selectedKit)`) downloads the zip with zero payment check. The whole catalog's pricing is cosmetic. **Still open** — per product decision, the web demo gates *time*, not kit downloads. If you start selling kits as a revenue stream, this needs a real checkout.
2. **F — The full tool was freely hosted.** **Fixed** — the web build is now a 20-minute timed demo with a $5 paywall (see "Demo gate & $5 one-time purchase" in README).
3. **D — No onboarding.** **Fixed** — first-run now shows a welcome modal explaining the free session and the $5 offer. (Deeper in-app guidance for the 9-stage pipeline is still a future enhancement.)
4. **Red CI.** **Fixed** — the 37 `tsc` errors across 10 files were resolved. Lint, tests, and build all pass now.
5. **Red E2E.** **Fixed** — `e2e/app.spec.ts` scoped to `main` (was failing on duplicate `h2`); added a welcome-gate smoke test.
6. **Meta description missing** (`index.html`). **Fixed** — added.
7. **Heavy critical path** — 155 kB gzip main chunk; consider splitting more eagerly or deferring non-critical UI. Not blocking.
8. **Dev-server crash on Tauri builds.** **Fixed** — `vite.config.ts` now ignores `src-tauri/target` (and other artifact dirs), so running `cargo`/`tauri build` no longer kills the Vite watcher (EBUSY).

## Deployment readiness

**As a free, fully-open web tool:** ~95% — all CI gates green locally; remaining risk is bundle size and the cosmetic kit pricing.

**As a $5 paid desktop product with a demo funnel (the actual goal):** **~95%** as of the 2026-08-09 second re-audit. Both launch blockers are closed: the new-code coverage gate is green and the NSIS installer builds. Only deployment/ops steps remain.

### Live verification (2026-08-09 re-audit #2)

| Gate | Result |
|---|---|
| `npm run lint` (tsc --noEmit) | **PASS** |
| `npm test` | **764/764 pass** (80 files) |
| `npm run build` | **PASS** (27s; main chunk 486 kB raw / 150 kB gzip) |
| `npx playwright test` | **PASS** (2/2) |
| `cargo test --all-targets` (src-tauri) | **PASS** (31/31) |
| Global coverage floor | **PASS** — 56.0% stmts (threshold 40/32/40/40) |
| **New-code coverage gate** | **PASS** (was FAIL) |
| `npm run tauri:build` | **PASS** — NSIS installer produced |

### What was fixed this pass

1. **Coverage-gate attribution bug.** `scripts/check-new-code-coverage.mjs` keyed hit counts by istanbul *statement ID* as if it were a line number; v8's IDs don't match source lines, so executed straight-line code reported as uncovered. `stmtMap` now maps through `statementMap[id].start.line`. This is the "vitest source-map fix" the earlier audit flagged.
2. **jsdom Web Audio globals missing.** The real engine's `source instanceof AudioBufferSourceNode` / `ctx instanceof BaseAudioContext` threw `ReferenceError` in jsdom, so every trigger aborted before the MPC-choke / return / send-bus paths. Added `AudioBufferSourceNode`/`OscillatorNode`/`BaseAudioContext` stubs to `src/tests/setup.ts`.
3. **New tests:** `audioEngine.coverage.test.ts` (14 tests — FX kitchen-sink incl. all 5 HSF engines, MRS/TIL/SubLab sub, envelope release sub-branches, choke-group lifecycle, helper-source `onended`, transport end-of-duration stop, offline `exportWav`/`exportLayerStem` fades), `sampleLibrary.db.test.ts` (6 tests — save/fetch/decode-cache DB paths), and 4 new `DemoCountdown` interaction tests.

### Remaining before public launch

- [x] **RED CI on next push/PR** — gate is green; `COVERAGE_BASE=origin/main npm run coverage:check` passes on the full working tree.
- [x] **Real Stripe Payment Link live** — `https://buy.stripe.com/eVqdRb5Ribjd4rN16e3oA07` (NC Sound Lab Desktop, $5 one-time; product `prod_V2pLmPqywATHbI` / price `price_1U2jgyQrfNRBru0zPniNW35r`) wired into `src/lib/demoConfig.ts`.
- [x] **NSIS installer builds** — `src-tauri/target/release/bundle/nsis/NC Sound Lab Studio_1.0.0_x64-setup.exe` (4.6 MB) + portable `nc-sound-lab.exe` (11.8 MB).
- [x] **Host the installer** where the Stripe confirmation page / README points buyers — **DONE**: `v1.0.0` published to GitHub Releases (2026-08-14) with NSIS installer + updater bundle; `DOWNLOAD_URL` now resolves.
- [x] **Paid-kit download integrity (audit finding #1)** — **DONE**: web build now gates paid kit downloads behind purchase (purchase-gate modal, tested); free kits download freely.
- [x] **UI/UX ease-of-use** — **DONE**: deep-linkable stages via `#stage=` hash, always-reachable Manual button in the header, hotkey index expanded.
- [x] **Manual coverage of all functions** — **DONE**: 19 chapters incl. Beat Studio, Console Mixer, Sampling & Recording, Stems/AAF/Pro Tools, Projects & Autosave, Web Demo & Purchase.
- [ ] **Code-sign the EXE** (optional but removes SmartScreen warnings; needs an Authenticode cert).
- [ ] Minor: `Dockerfile`/`.dockerignore` (deployment-readiness plan Step 6 — deploy path is Vercel/static + Tauri, so not blocking).

> Target after the installer is hosted + (optionally) signed: **~98%**. With v1.0.0 shipped, remaining work is optional hardening (code-signing, Docker).

## Coverage note (new-code gate)

Baseline overall: **45.06% statements** (now **49.3%** after demo-gate + DSP test work). Rather than grind the legacy UI shell to an arbitrary whole-app number, the project enforces **90% on new code**:

- `scripts/check-new-code-coverage.mjs` — new files ≥90% whole-file; modified files ≥90% on added lines. Tolerates v8/istanbul source-map misattribution (verified across 8 files: executed `useState` hooks, module-level `export const fn = …` arrows, and loop bodies report 0 hits) via a noise budget, plus an 80% floor for new files so half-tested modules can't hide.
- Wired into CI (`COVERAGE_BASE=origin/main npm run coverage:check`) and `vitest.config.ts` global thresholds (40/32/40/40) as a no-regression floor.
- **Gate status:** all demo-gate code 93–100%; in-flight DSP files brought up with new tests — `SoundLayerPlayer` (new test), `WaveformCanvas` (component render tests), `chopLogic` (100%), `audioEngine` curve cache/choke/dynamics (new test, new code 18.5% → **40.5%**).
- **Known exception:** `src/lib/audioEngine.ts` (user's in-flight 2,622-line DSP refactor) still fails the local gate at 40.5% of new lines — its remaining gap is deep async FX-chain branches (synth/reverb/delay/sidechain) plus constructor code the tests already execute but the source map misattributes. It needs either more async-mocked tests, a vitest source-map fix, or splitting the file. It is **not** blocked in CI (uncommitted work isn't in the `origin/main` diff).

## Test totals (final)

- **764 unit/component tests** (was 741), 80 files — all passing.
- **2/2 e2e** passing.
- `tsc --noEmit` clean, production build clean, `cargo test` clean, NSIS installer builds.
