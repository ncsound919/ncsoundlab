# The ecosystem, in one place

Thirteen surfaces, one identity, one compute fabric. This file is the map: what runs where,
which folder it lives in, and what answered when it was checked on **2026-10-28**.

Companions: [`MASTER-PLAN.md`](MASTER-PLAN.md) (what order to do it in, and
where each thing runs), [`READINESS.md`](READINESS.md) (how close each app is),
[`CRONS.md`](CRONS.md) (what runs on a schedule),
[`KAGGLE.md`](KAGGLE.md) (training status).

---

## 1. Layers

```
  SURFACES          Concordance (Android)   Sieve (Android)   Recourse (Android)
                    NC Studio (Android)     Phone Beat (Android)
                    Field / NC Sound Lab (web + Windows)
                    AetherDesk (web + Android)   Math X   OpenHub

  EDGE              concordance-web (Worker)          mobile-gateway (Worker)
                    sieve-ingest (Worker)             marketing-signal-gateway (Worker)
                    llm-mesh (one OpenAI-compatible surface for every app)

  ENGINES           concordance-agent (Modal)          referee-core (Modal)
                    AetherDesk API (AWS EC2 us-east-1)  local llama.cpp / Ollama

  DATA              Supabase  ktphbqvoycurlyxieurv     Sieve telemetry spine
                    D1 / KV / R2 at the edge          Kaggle (training)
```

The rule that keeps this from turning into a mesh: **surfaces only talk to the
edge, the edge holds every key, and the engines only talk to each other through
signed, schema-validated events.** If an app needs a new capability, it calls a
`/v1/*` route; it does not get a key.

---

## 2. Live inventory

Probed with `curl` from this machine. A `000` here means **this LAN blocks the
domain**, not that the service is down — the network's filter answers HTTP with a
302 to `block.charter-prod.cujo.io` and resets TLS. Re-test from cellular.

| Surface | Host | Result |
|---|---|---|
| Concordance web | `concordance-web.tap4500.workers.dev` | **200** |
| Sieve ingest | `sieve-ingest.tap4500.workers.dev` | **200** |
| Mobile gateway | `mobile-gateway.tap4500.workers.dev` | **200** |
| Marketing signal gateway | `marketing-signal-gateway.tap4500.workers.dev` | **200** |
| NC Sound Lab preview | `site-edd3acae…freebuff.page` | **200** |
| Sieve spine | `telemetry.overlay365.online` | 000 — filtered (DNS → `184.197.245.205`) |
| AetherDesk API | `api.overlay365.online` | 000 — filtered (DNS → `32.195.247.106`) |
| Catalogue | `overlay365.online/ncsound` | 000 — filtered (DNS → `216.198.79.1`) |
| Kaggle dashboard | `127.0.0.1:8099` | **down** — restart per `KAGGLE.md` §0 |

`overlay365.online` resolves to Vercel anycast. `ncsound.overlay365.online` has
**no DNS record** — use the path `/ncsound`, which is what the site is built for.

---

## 3. Where everything lives

Desktop paths are absolute because those tools span unrelated folders. Mobile
paths are relative to `C:\Users\tap45\Downloads`, and every mobile surface now
lives under one root: `phone-apps/`.

### Mobile — one root

| Folder | What | Entry point |
|---|---|---|
| `phone-apps/field` | **NC Field** standalone PWA | `npm test` · `npm run build` |
| `phone-apps/phone-beat/mpc` | **NC Phone Beat** Android MPC | `./gradlew :app:assembleDebug` |
| `phone-apps/nc-studio` | **NC Studio** Android DAW | `./gradlew :app:testDebugUnitTest` |
| `phone-apps/concordance` | **Concordance** Android client | `./gradlew :app:testDebugUnitTest` |
| `phone-apps/concordance-oss` | **Concordance OSS** public edition | `./gradlew :app:testDebugUnitTest` |
| `phone-apps/sieve` | **Sieve** Expo client | `npm test` |
| `phone-apps/recourse` | **Recourse** Expo client | `npm test` |
| `phone-apps/agent-support` | **Agent Support** Android runtime | `./gradlew :app:testDebugUnitTest` |
| `phone-apps/aetherdesk-mobile` | **AetherDesk** softphone | `npm test` |
| `phone-apps/marketing-studio` | **Marketing Studio** Android + Next console | `web/`: `npm test` |

### Model fabric — one gateway

Every app calls `phone-apps/shared/llm-mesh` instead of a provider directly:

| Folder | What | Entry point |
|---|---|---|
| `phone-apps/shared/llm-mesh` | **LLM mesh** — routing, typed decisions, Sieve/Recourse/Agent Support hops | `npm test` · `node src/server.mjs` |
| `phone-apps/Pulse Daw/kaggle_qwen_*` | Four trained LoRA adapters (no GGUF yet) | `node ../shared/llm-mesh/scripts/check-artifacts.mjs` |

The plan, the model-to-app matrix and the missing-GGUF blocker are in
`phone-apps/shared/llm-mesh/PLAN.md`. Each app has the shared TypeScript or Kotlin
client under its own source tree; edit the canonical client and run the sync
script.

### Audio — the product line

| Folder | What | Entry point |
|---|---|---|
| `C:\Users\tap45\Downloads\ncsoundlab-main` | **NC Sound Lab** web + Tauri (the current `/field.html` deploy mirror) | `npm run dev` → `:3001` |
| `C:\Users\tap45\Downloads\Pulse Daw` (root) | Training data + kernels | `data_out/`, `kaggle_qwen_*` |

The handoff chain between them is `.ncbeat`:
`Field` → kit export · `Phone Beat` → project export · `NC Studio` → import · `AetherDesk`-style AAF → Pro Tools.

### Research

| Folder | What |
|---|---|
| `C:\Users\tap45\Downloads\eco\Oncology-Ecosystem-main\Oncology-Ecosystem-main` | 13-tool monorepo, field guide, book build, orchestration |
| `…\Oncology-Ecosystem-main\apps\math-x` | **Math X** mirror (canonical: `github.com/ncsound919/math-x`) |
| `…\Oncology-Ecosystem-main\apps\concordance-web` | The website source |

### Operations

| Folder | What |
|---|---|
| `C:\Users\tap45\Downloads\eco\wiring` | **The registry.** `registry.json` + `check-live`, `check-contracts`, `verify-parity`, `test-signal-hop` |
| `C:\Users\tap45\Downloads\phone-apps\marketing-studio\web` | Marketing console (Next 16) |
| `C:\Users\tap45\Downloads\phone-apps\marketing-studio\kaggle-trainer-app` | Kaggle dashboard backend |

Everything self-documents a *lot*. The risk is not missing docs — it is four
overlapping readiness documents per project. `READINESS.md` is the one to trust
for release status; the per-repo plans are the design record.

---

## 4. The catalogue page

Built there-and-then, live in this repo:

- `public/ncsound/` — `index.html`, `ncsound.css`, `ncsound.js`, `content.json`
- No build step, no dependencies, no framework, no external requests. Copy the
  folder anywhere and it works.
- Routed at `/ncsound` by both hosts (`vercel.json` rewrite + `sites/worker.mjs`
  pin), and excluded from Field's PWA precache so the app shell never answers a
  catalogue URL.

**To publish an album, kit or video: edit `content.json` only.** The three
collections are empty on purpose — the copy says so, rather than inventing
product names. Shapes:

```jsonc
// albums[]
{ "title": "…", "year": 2027, "kind": "Album", "blurb": "…", "art": "/ncsound/art/x.jpg", "url": "…" }

// media[]
{ "title": "…", "blurb": "…", "url": "https://…" }   // embeds from the source, never re-hosted

// kits[] already has the six engine families; add "url" when a pack ships
```

Then redeploy. `content.json` is served `no-cache`, so a change is visible on the
next load without a rebuild.

---

## 5. Decisions

**Answered 2026-10-28** (see [`MASTER-PLAN.md`](MASTER-PLAN.md)):

- **`overlay365.online` is the music side.** The publishing company lives there;
  `/ncsound` is its catalogue. Research stays on the hub.
- **Agent Support is a product**, not a spare app. It is the runtime that acts,
  with Recourse for memory and Sieve for telemetry.
- **No Play Store.** Distribution is website + direct APK + PWA.
- **Two companion apps: merge them.** One shell, two tabs (Observe / Remember).

Still open:

1. **Who owns the upload keystores?** One per Android app, three copies each,
   off-machine. Until they exist, no Android score can move — and with no store
   to fall back on, an app that cannot be re-signed cannot be updated at all.
2. **Does NC Studio stay Android-only?** Expo would have kept iOS open; native
   Kotlin closes it. Fine, but decide it deliberately.
3. **What does IBM Cloud do?** No workload, no credential, no reference in
   `wiring/registry.json`. Either give it one job or drop it from the map.
4. **Does the Tauri desktop app stay?** It needs a Windows machine, which
   conflicts with the phone + cloud model.

---

## 6. The one-line summary

The audio line is real and nearly shippable; the research line is live but
unreleased; the companion apps are scaffolding with excellent plumbing. The
constraint is not code — it is **signing keys, CI that produces an APK, and a
published production URL**, all of which are hours of work rather than weeks.
