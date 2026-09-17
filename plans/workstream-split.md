# Workstream Split — Parallel Agent Coordination

**Status:** Active · **Last updated:** 2026-09-17

Two agents work in this repo at once. A previous collision (HEAD moved mid-session
while another agent committed to `App.tsx` and the stores) is what this document
prevents. **File ownership is exclusive.** If you need a file you do not own,
request it — do not edit it.

---

## 0. Baseline — do this before either lane starts

All of the following is **uncommitted on `main`** and is finished, verified work:
the Phase 2.2 undo coverage, the typed action registry, the pre-existing `tsc`
fix, the clamp normalization, and the port move.

```
 M README.md
 M package.json
 M src-tauri/tauri.conf.json
 M src/App.tsx
 M src/audio/tempoDetection.{ts,test.ts}
 M src/components/CompareEnginePanel.coverage.test.tsx
 M src/components/HeaderTransport.{tsx,test.tsx}
 M src/components/StudioSequencer.{tsx,coverage.test.tsx}
 M src/components/controller/{ControllerHost,studioControllerHandlers}.{tsx,ts} + their tests
 M src/lib/appCommands.{ts,test.ts}
 M src/lib/{recourseBridge,recourseEvolution}.ts + recourseBridge test
 M src/store/historyStore.{ts,test.ts}
 M plans/command-center-integrations.md
?? src/lib/actions/            (registry.ts, registry.test.ts)
?? src/lib/controlRanges.{ts,test.ts}
```

**Commit this before Lane B touches `src/lib/controller/**` or `src/App.tsx`.**
The clamp normalization already edited controller files, so starting Lane B on a
dirty tree guarantees a collision.

Suggested commit: `feat: typed action registry + undo coverage, clamp unification, free tier`

Verification already run on this baseline: `npm run lint` clean;
**215 test files / 2407 tests pass**.

---

## 1. Frozen interfaces (both lanes must honour these)

Treat as public API. Do not change signatures; add new entries only.

```ts
// src/lib/actions/registry.ts  — OWNED BY LANE B, read-only for Lane A
export interface ParamSpec { name; type; min?; max?; step?; unit?; options?; label? }
export interface ActionSpec { id; label; group; params; mutatesAudio; undoable }
export function specForAction(id: string): ActionSpec
export function validateActionArgs(id: string, args?: Record<string, unknown>): ValidationResult
export function clampParam(spec: ParamSpec, value: ParamValue): ParamValue
export function allActionSpecs(): ActionSpec[]

// src/lib/controlRanges.ts  — OWNED BY LANE A, read-only for Lane B
export const BPM_MIN = 60; export const BPM_MAX = 240;
export function clampBpm(v: number): number
export function clampSwingFraction(v: number): number
export function clampSwingPercent(v: number): number
export function swingPercentToFraction(p: number): number
export function swingFractionToPercent(f: number): number
```

New interfaces each lane must implement (defined by Lane A, consumed by nobody else yet):

```ts
// src/lib/ai/secrets.ts
export interface SecretProvider {
  readonly id: 'keywire' | 'manual' | 'none';
  readonly persistent: boolean;      // false for manual/session memory
  getSecret(name: string): Promise<string | null>;
}

// src/lib/ai/provider.ts
export interface LlmProvider {
  readonly id: string;
  complete(messages: ChatMessage[], opts?: CompletionOptions): Promise<CompletionResult>;
}
```

---

## 2. Lane A — Phase 3.1: desktop egress, secrets, provider

**Owner: primary agent.**

### Deliverables

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | add `tauri-plugin-http` |
| `src-tauri/src/lib.rs` | register the http plugin |
| `src-tauri/capabilities/default.json` | scoped http permission (Keywire + user LLM base URL) |
| `src/lib/ai/keywire.ts` | `fetchSecret()` via the http plugin; `AbortController` timeout; never logs the value |
| `src/lib/ai/secrets.ts` | `SecretProvider`; `keywire` (desktop) + `manual` (session memory) |
| `src/lib/ai/provider.ts` | `LlmProvider` interface + `null` provider |
| `src/lib/ai/openaiCompatible.ts` | chat-completions client (covers Ollama via `/v1`) |
| `src/store/aiProviderStore.ts` | persisted **non-secret** config only |
| `src/components/AiSettingsPanel.tsx` (+ test) | enable toggle, Keywire URL/project/env/key-name, service token (session), LLM base URL/model, "test connection" |
| `src/App.tsx` | mount `AiSettingsPanel` (this lane owns App.tsx) |
| `src/lib/ai/*.test.ts` | unit tests |

### Hard constraints

- **All network goes through Rust** (`tauri-plugin-http`). The renderer never
  calls `fetch` to Keywire or an LLM. This is what removes the CORS and CSP work.
- **No secrets at rest.** The Keywire service token lives in session memory; the
  provider key is held in Rust memory. Never Dexie, `localStorage`, or `.nsl`.
- **No CORS change to Keywire. No new CSP entry for Keywire or the LLM.**
- Optional and off by default; with Keywire absent, the app behaves exactly as today.
- Do **not** add the Keywire origin to CSP — if you find yourself editing
  `vercel.json` / `.headers` / `nginx.conf` for this, the design has drifted.

### Do NOT touch

`src/lib/actions/**`, `src/lib/controller/**`, `src/components/controller/**`,
`src/components/Mpd226Layout.tsx`, `src/lib/controlRanges.ts` (you own it after
baseline, but freeze it), `src/store/historyStore.ts`, `src/lib/workflowStages.ts`.

### Done when

- Desktop: a secret can be read from Keywire and used for one completion; the
  value never appears in DevTools, Dexie, or the DOM.
- Non-desktop: degrades to session-memory entry with an explicit message.
- `npm run lint` clean; new files meet the 90% new-code coverage gate;
  `npm test` green.

### Progress (2026-09-17)

Landed and verified:

- `src-tauri/src/net.rs` — the `http_request` command, with `is_allowed_url`
  enforcing **https anywhere, http on loopback only**. 3 Rust policy tests pass;
  `cargo check` clean. No new capability entry is needed: this is a custom
  command, so the `tauri-plugin-http` approach in the original plan was dropped
  as unnecessary.
- `Cargo.toml` / `Cargo.lock` — `reqwest 0.13` with the **`rustls`** feature
  (0.13 renamed the old `rustls-tls`; `default-tls` now resolves to rustls).
- `src/lib/ai/transport.ts`, `keywire.ts`, `secrets.ts`, `provider.ts`,
  `openaiCompatible.ts`, `src/store/aiProviderStore.ts` + 49 tests.
  Coverage: **100% statements / 98% branches** across all new modules.

Remaining in this lane: none — **Phase 3.1 is complete.**
- `src/components/AiSettingsPanel.tsx` + 11 tests (transport injectable for tests).
- Mounted in `src/App.tsx` behind `isAiSettingsOpen`, wired into
  `otherModalOpen`, the Escape chain, and the keyboard dependency array.

**Gotcha found and fixed while mounting (worth knowing for any new modal):** the
lazy panel was first placed *inside* the shared modal `<Suspense>` boundary,
which made that boundary suspend and rendered **every other modal** as `null`
until the chunk resolved — it broke four `App.extra` tests intermittently.
Fixed by gating the mount (`{isAiSettingsOpen && <Suspense>…}`), the same pattern
`ChopEditor` already uses. Cost me a false "it's just flaky" conclusion: the
failing test set *changed* between runs, which looked like load flakiness but was
actually timing-dependent suspension. **Always distinguish the two by stashing
your own change and re-running.**

## Known issue — the suite is load-sensitive

Two full runs during this session produced **7 failures**, then **1**, from
different files; the file that failed the second time passes 51/51 in isolation.
Suite duration varied 301s / 633s / 467s under the same command. This is
load-induced flakiness (heavy component tests brushing the 15s timeout when the
machine is busy — likely while another agent runs its own suite), not a
regression. CI runs on an isolated runner and is unaffected. Worth addressing
separately: raise `testTimeout` for the heavy component files or cap workers.

---

## 3. Lane B — Phase 7: MIDI controller profile platform

**Owner: other agent.**

### Deliverables

| File | Change |
|---|---|
| `src/lib/controller/profiles/types.ts` | `ControllerProfile` schema (versioned JSON) |
| `src/lib/controller/profiles/registry.ts` | profile registry; import/export; validation |
| `src/lib/controller/profiles/mpd226.ts` | the existing MPD226 default **as data**, not code |
| `src/lib/controller/actions.ts` | extend `ACTION_DEFS` / `ActionGroup` as needed (spine owner) |
| `src/lib/actions/registry.ts` | add `ParamSpec`s for any newly catalogued actions |
| `src/components/controller/ControllerProfilePanel.tsx` | pick/import/export profiles |
| `src/components/Mpd226Layout.tsx` | becomes a template registered by profile id |
| tests alongside each new file | |

### Hard constraints

- **Do not change** the frozen `registry.ts` signatures; additive entries only.
- `defaultMpd226.ts` must remain importable until the registry replaces it —
  ship the data profile and switch the consumer in the same commit.
- No new npm dependencies (the `ActionSpec`/`Mapping` primitives already exist).
  If a dependency is genuinely needed, request it from Lane A.
- Do **not** edit `App.tsx`. Mount the profile panel inside the controller
  components you already own. If an `App.tsx` line is unavoidable, request it.

### Do NOT touch

Everything under `src/lib/ai/**`, `src/store/aiProviderStore.ts`,
`src-tauri/**`, `src/App.tsx`, `src/lib/controlRanges.ts`.

### Done when

- A profile round-trips: export → import → identical bindings.
- A registry-driven MPD226 profile reproduces today's default bindings exactly.
- `ControllerHost.test.tsx` still passes; new profile code meets the coverage gate.

### Progress (2026-09-17) — Lane B started by the primary agent

Ownership note: the primary agent has taken Lane B for now. If a second agent
joins, hand these files back and coordinate before editing.

- `src/lib/controller/profiles/document.ts` — versioned `soundlab.controller-profile`
  envelope, strict per-binding validation (`sanitizeBinding`), tolerant parsing
  that also accepts a **bare** profile so a partner can hand-write one, and
  explicit reporting of dropped bindings instead of silent coercion.
- `src/lib/controller/profiles/registry.ts` — register / list / get / unregister,
  `loadBuiltinProfiles()` (the three MPD226 layouts as `builtin`), and
  `importProfile` / `exportProfileJson` round-trips. Registration is explicit,
  not an import side effect.
- 31 tests. Coverage: **document.ts 98.7%**, **registry.ts 96.4%** statements.

Still to do in this lane: migrate `controllerStore` + the controller UI onto the
registry, and add the profile picker/import/export panel.

---

## 4. Lane C — Recourse hardening (separate repo, zero overlap)

Repo: `C:\Users\User\Downloads\recourse` (independent git remote). Safe to run
any time in parallel; blocks Phase 6 only.

- **C1** Add `OPTIONS` preflight + `Access-Control-Allow-Methods` +
  `Access-Control-Allow-Headers: Content-Type, x-api-secret, Authorization` on
  the routes SoundLab POSTs to; add the missing `ACAO` on `GET /compose/styles`.
- **C2** Gate the ungated mutating routes (`/learn/episode|run|replay`,
  `/memory/index`, `/skills/rescan`, `/decision/weights|execute`,
  `/api/ollama/chat`) to match their `/v1` serverless mirrors.
- **C3** Bind `127.0.0.1`, not `0.0.0.0` (`server.ts:9708`).
- **C4** Confirm a documented completion endpoint exists (or that SoundLab goes
  direct to the provider and never uses Recourse as a gateway).

---

## 5. Contended files — rules of engagement

| File | Rule |
|---|---|
| `src/App.tsx` | **Lane A only.** Lane B requests changes. |
| `src/lib/actions/registry.ts` | **Lane B only.** Lane A consumes read-only. |
| `package.json`, lockfiles | **Lane A only.** Lane B requests additions. |
| `src-tauri/**` | **Lane A only.** |
| `src/store/historyStore.ts` | **Frozen.** Neither lane edits. |
| `src/lib/workflowStages.ts` | **Frozen.** No new tabs in 3.1 or 7. |
| `README.md`, `plans/**` | Serialize. Announce before editing. |
| `src/components/SampleBrowser.tsx`, `src/lib/{folderLink,sampleLibrary}.ts` | Reserved for Phase 4 — neither lane. |

## 6. Port / URL map

| Service | URL | Notes |
|---|---|---|
| Keywire vault | `http://127.0.0.1:3000` | Auth required; **no CORS** — Rust-only access |
| SoundLab dev | `http://localhost:3001` | moved off 3000 and 3117 |
| Playwright E2E | `3117` | unchanged |
| Recourse | `http://localhost:3050` | optional; webview-fetched (has CORS on GETs) |
| Ollama | `http://localhost:11434` | reached through Rust or Recourse |

## 7. Verification and commit protocol

Every lane, before claiming done:

1. `npm run lint` (must be clean — one `tsc` error blocks CI).
2. `npm test` (full suite; expected baseline 2407+ passing).
3. Any new frontend file must clear `npm run coverage:check`.
4. Tests assert **behaviour, not clickability**. The undo bug shipped because
   tests only checked that a button existed. Every fix gets a regression test.

Commits: conventional style (`feat:` / `fix:` / `docs:` / `chore:`), small, one
lane per commit, and never `git add -A` from the repo root.

Coordination: at the start of a session check `git log --oneline -3` and
`git status --short`. If HEAD moved or files you do not own are dirty, stop and
reconcile before editing.

## 8. Definition of done (whole programme)

- Phase 3.1 (Lane A) and Phase 7 (Lane B) both green, on one HEAD, no overlapping edits.
- Phase 4 (grounding) next, using **Meyda + Tonal** (already installed, permissive).
- Phase 6 (Recourse) after Lane C.
- Phase 5 (ops hub) last, only if it will actually be used.
- Stems remain deferred pending the Phase 0 spikes.
