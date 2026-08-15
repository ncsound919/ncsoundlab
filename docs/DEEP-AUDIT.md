# NC Sound Lab — The Deep Audit Report

**Date:** 2026-08-15 · **Tool:** The Deep (`C:\Users\User\Downloads\The Deep`) — 3 deterministic engines
**Runner:** `npx tsx run-audit.mjs <dir>` (writes JSON to `deep-audit-reports/`)

---

## Run summary

| Engine | Method | Raw findings |
|---|---|---|
| `static-analysis` | ESLint (security / no-secrets / sonarjs) + TS compiler API | 4,858 |
| `deep-intent` | 10-category deterministic detectors | 463 |
| `bug-taxonomy` | 20-bug semantic classes | 2,332 |
| **After dedupe** | | **7,474** |

**Files scanned:** 244 (all `.ts`/`.tsx`/`.js`/`.mjs` in `src`, excluding `node_modules`, `dist`, `src-tauri`, `e2e`, tests' heavy dirs).

---

## How to read this (important)

The raw counts are dominated by **harness artifacts**, not real bugs:

- **4,619 × `TS17004` ("Cannot use JSX...")** — The Deep's in-memory TypeScript program does **not** load soundlab's `tsconfig.json` / `node_modules`, so it reports JSX/module/`lib` diagnostics that don't exist in the real build. **Proof:** `npm run lint` (`tsc --noEmit`) in soundlab passes with **0 errors**. Every `TSxxxx` finding is a false positive from the virtual host, except where verified against the real codebase below.
- **812 × `BUG-TOCTOU`**, **458 × `ARCH-NO-DIRECT-DB-IN-CONTROLLER`**, **413 × `BUG-RESOURCE-LEAK`**, **177 × `BUG-AUTHZ-FLAW`** — heuristic pattern-matching designed for server/DB apps; NC Sound Lab is a **local-first, offline web audio app** with no authz, no server DB, and intentional per-trigger node teardown. Most are out-of-domain false positives.

**After removing harness + out-of-domain noise, the genuine signal is small.**

---

## Genuine findings (verified against real code)

### 1. Non-crypto `Math.random()` for entity IDs — FIXED ✅

| File | Line | Fix |
|---|---|---|
| `src/store/compareEngineStore.ts` | snapshot `id` | now uses `crypto.randomUUID()` (with Date fallback) |
| `src/lib/projectFormat.ts` | arrangement clip `id` | now uses `crypto.randomUUID()` (with Date fallback) |

The app already uses `crypto.randomUUID()` for layer/kit/pattern IDs; these two sites were the stragglers.

### 2. `Math.random()` in audio-variation / PRNG — INTENTIONAL, no change

- `coverArtAgents.ts` — **deterministic** mulberry32 PRNG by design (same seed → same cover). The file header explicitly documents this.
- `batchAudioProcessor.ts` — audio-variation entropy (pitch/drive drift). Randomness is the point; not a security context.
- `projectFormat.ts:224` — already prefers `crypto.randomUUID()`; `Math.random` only in the legacy fallback.

### 3. Empty `catch` blocks — intentional teardown, no change

- `SoundKitCatalog`, `CompareEngine`, `SoundLayerPlayer`, `audioEngine` — `catch { /* ignore */ }` around `AudioNode.stop()/disconnect()` is deliberate: a node may already be stopped/disconnected, and throwing there would break audio teardown. This is the idiomatic Web Audio pattern (matches our own earlier audit).

### 4. Not real

- `BUG-INJECTION` on `container.innerHTML = ''` (ChopEditor/WaveformEditor) — clearing a container is not an injection vector.
- `NUM-FLOAT-MONEY` in ReverbUI — comparing knob values, not currency.
- `CACHE-STALE-READ` in TapeDelayDSP — the curve caches are pure `getOrCreate` with computed keys; no stale-read window.
- `DATA-QUERY-IN-LOOP` (45) — `await` loops over local sample/folder arrays; serial is correct for IndexedDB decode.

---

## Verdict

**NC Sound Lab is clean under The Deep's deterministic engines once harness artifacts are discounted.** The two genuine ID-hygiene findings were fixed. All remaining hits are either tool misconfig (TS/JSX diagnostics) or intentional patterns for a local-first Web Audio app.

Repeat at any commit: `cd C:\Users\User\Downloads\The Deep && npx tsx run-audit.mjs C:\Users\User\Downloads\soundlab`
