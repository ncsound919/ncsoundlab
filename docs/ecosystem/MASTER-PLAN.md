# Master plan — phone-only, store-free, revenue-ready

**Date:** 2026-10-28
**Basis:** the 2026-10-28 audit in [READINESS.md](READINESS.md), the service
registry in `eco/wiring/registry.json`, and the live phone control plane at
`ecosystem-control.tap4500.workers.dev`.
**What this replaces:** the assumption, throughout the old scorecard, that a
Play Store listing is the distribution path. The evidence stands; the target
moved.

> **The plan in one sentence:** ship four signed APKs and six web surfaces from
> one label site, run them from one box plus the edge, watch them in one
> dashboard, and sell one B2B pilot — in that order.

Read it on a phone: every section opens with the decision, then the reason.

---

## 0. The three constraints, stated once

1. **No Play Store.** Distribution is direct install and the web. That removes
   the listing work and replaces it with a harder, smaller problem: **signing
   keys and an update channel**.
2. **No laptop.** Builds, signing, releases and operations must run in the
   cloud or on an always-on box, driven from the phone.
3. **One operator.** Capacity, not ambition, is the limit. Anything that adds a
   second control surface, a fifth catalog, or a seventh cloud must justify
   itself against the next release.

The old readiness question was *"is it store-ready?"* The new one is:

> **Can a stranger install or open this from a phone in under two minutes, and
> can you ship them an update tomorrow from the same phone?**

Nothing else counts as "ready".

---

## 1. The surface decision — the largest reduction available

**Decision: six Android apps become five packages — four ship first, Agent Support last.**

An APK is only justified when the browser cannot do the job:

| Need | Why the browser loses | Apps |
|---|---|---|
| Low-latency audio thread | Web Audio adds jitter and buffer control you do not own | Phone Beat, NC Studio |
| Camera/OCR + offline sync | Native capture and a durable local queue | Concordance |
| A local server / foreground service | The thing *is* an on-device service | Agent Support |

Everything else is a thin client over HTTPS, and most thin clients belong in
the browser: no signing key, no install prompt, no update channel, no version
skew. The companion is the one exception, because it already depends on native
deep links and secure storage.

| Surface | Ship as | Why | Artifact today |
|---|---|---|---|
| **NC Sound Lab / Field** | **PWA** | Mic capture, offline, install-to-home-screen already work | `dist/` + published preview |
| **Phone Beat** | **APK** | C++17 engine, 16 pads, real-time thread | none signed |
| **NC Studio** | **APK** | 16-track DSP timeline | signed block, no keystore |
| **Concordance** | **APK** | OCR, offline adjudication, Supabase sync | 91 MiB signed APK exists |
| **Sieve + Recourse** | **one APK shell** (Observe / Remember) | Thin clients, but deep links and secure storage are already native; EAS builds it in the cloud | Expo 0.1.0, no release build |
| **Agent Support** | **APK, Phase 4** (fifth package) | The runtime, not a spare app: hosts the memory service and a foreground service | `com.example` scaffold |
| **Math X** | **web** | A workbench, used at a desk or in a tab | source only |
| **OpenHub** | **web on the phone** (Termux), box optional | Node/Express + SQLite + terminal; runs where the code is | runs locally |
| **Ecosystem Control** | **PWA** | Already installable, already live | live |
| **Marketing console** | **web on the box** | `node:sqlite` + Postiz; not a Workers target | not deployed |
| **AetherDesk** | **web SaaS** | Buyers use a desktop browser; mobile is secondary | live API on AWS |
| **Oncology Ecosystem (13 tools)** | **web + tagged releases** | Public research tools need no install; distribution is a tag and an artifact | branch archives |
| **TruckBuddy** | **separate venture** | Three apps, separate market, separate gate | live domain, priced |

**Why this matters:** six Android surfaces meant six keystores, six release
pipelines, six install pages and six update paths. Five packages — with the
companions merged — means the whole release surface fits in one afternoon a
month. The merge is the easiest cut: they share a login, a gateway and a design
system, and two installs for one account is upkeep with no user benefit.

**If you keep Sieve and Recourse native:** ship them as **one** package with two
tabs (Observe / Remember), not two listings. EAS is the right lane: it builds in
the cloud and hands you an APK, with no laptop and no store.

The Oncology monorepo is not a surface; it is a **release process**. Tag each
tool and attach a build instead of shipping branch archives, starting with the
two that are actually consumed (Math X and the field guide). A tag with no user
is still a tag, but it is not a priority.

---

## 2. Distribution without a store

### 2.1 One keystore per package, created once

Losing a signing key means you can never update that app again — the new build
is a different app to Android. Treat the key as the product.

Generate on the phone, in Termux (JDK 17 is packaged for Android):

```bash
pkg install openjdk-17
keytool -genkeypair -v -keystore ncphonebeat.jks -alias ncphonebeat \
  -keyalg RSA -keysize 4096 -validity 10000
keytool -list -v -keystore ncphonebeat.jks -alias ncphonebeat | grep SHA256
base64 -w0 ncphonebeat.jks > ncphonebeat.jks.b64
```

Then:

1. Store the `.jks` and its passwords in **Infisical** (the project already uses
   it). Keywire can remain the local resolver until OpenHub is migrated; do not
   add a third vault.
2. Keep one offline encrypted copy plus the **SHA-256 fingerprint on paper**.
   The fingerprint is what proves a build is yours even if the vault is lost.
3. Delete the plaintext `.jks` from the phone after upload.
4. Put the fingerprint in `assetlinks.json` and in the registry — not in a
   README that nobody updates.

**Never:** commit a keystore, reuse one key across packages, or let a CI service
generate the only copy.

### 2.2 The artifact

Every release produces exactly one installable file and one receipt:

```
app-v0.4.0.apk
app-v0.4.0.apk.sha256
release.json   { version, versionCode, sha256, size, minSdk, builtAt, commit }
```

- `versionCode` increases by at least 1 every release; never reuse one.
- `apksigner verify --print-certs` must pass before upload.
- Keep the last three APKs. A bad release is rolled back by reinstalling the
  previous file, which is only possible if you kept it.

### 2.3 Two channels, one page

**Human channel — `/downloads` on the label site.** One page, every app:
icon, version, date, size, SHA-256, minimum Android, install steps, privacy
link, and "why there is no Play Store". It reads a `downloads.json`, exactly
like the catalogue reads `content.json`, so a release is a data edit.

**Machine channel — GitHub Releases + Obtainium.** Tag `app-vX.Y.Z`, attach the
APK and its hash. Obtainium watches the repo and offers updates inside Android
without a store. Public release repos are zero-friction; a private repo needs a
token stored in Obtainium, so prefer public. This is the whole update mechanism;
do not build an in-app updater in v1.

**Install friction is real and must be written down.** Android 14+ requires the
user to allow installs from the browser or from Obtainium. Say so on the page,
with screenshots. A one-line "Allow from this source" instruction is the
difference between an install and a bounce.

### 2.4 Update rules

1. Same `applicationId`, same key, higher `versionCode`.
2. Never uninstall to update — that deletes local projects and memories.
3. Release notes name what changed and what to test.
4. The download page is the source of truth for "latest"; the dashboard reads
   the same `release.json`.

### 2.5 What not to build yet

- **An F-Droid repo.** It needs `fdroidserver`, reproducible builds and a
  metadata pipeline. Obtainium gives 90% of the benefit for none of that.
- **An in-app installer.** `REQUEST_INSTALL_PACKAGES` plus a user-confirmation
  flow is a week of edge cases for a problem Obtainium already solves.
- **AABs.** They are a store format. Build one only if a store ever enters the
  plan; the APK is the deliverable now.

---

## 3. The phone-only build lane

**Decision: hosted mobile CI for native Android, EAS for Expo, Workers Builds
for the web. The phone edits and triggers; it does not compile.**

| Surface type | Builds on | Trigger | Output |
|---|---|---|---|
| Web / PWA | **Cloudflare Workers Builds** (already proven on `ecosystem-control`) | push to `main` | deployed Worker + assets |
| Expo (Sieve, Recourse, AetherDesk mobile) | **EAS Build** | tag or `eas build` | APK |
| Native Android (Phone Beat, NC Studio, Concordance, Agent Support) | **Codemagic** (recommended) | tag `app-v*` | signed APK |
| Native Android, fallback | GitHub Actions — **only if the account block is lifted** | tag | signed APK |
| Tauri Windows | a Windows runner — **deferred** | manual | `.exe` |

**Why not Cloudflare Workers Builds for Android:** it is a JavaScript build
image. No JDK, no Android SDK, no `aapt2`. It is the right lane for the site and
the Worker, and the wrong one for Gradle.

**Why not the current AWS box:** it is a 1 GiB `t3.micro`. A Gradle build with
the Android SDK wants 4 GB before it is comfortable. If you want self-hosted
builds, the box must be at least 8 GB — see §4.4.

**Why Codemagic:** tag-triggered builds, encrypted keystore files, a web UI that
works on a phone, and no dependency on GitHub Actions. It is a new account and a
new bill (there is a free tier; confirm the current minutes before committing).
The fallback is Bitrise or GitLab CI, not a laptop.

**The credential rule:** the keystore and its passwords live in the CI
provider's encrypted secret store, injected at build time. They never appear in
`gradle.properties`, a workflow file, or an APK.

### 3.1 The release loop, from the phone

1. Edit in **OpenHub** (or any editor on the phone).
2. Commit and push.
3. Tag `app-vX.Y.Z`.
4. CI builds, signs, verifies and attaches the APK + hash to the release.
5. The site's `downloads.json` picks up the new version.
6. Obtainium notifies installed devices.

Six steps, no laptop. The first time through will take a day because the CI
account and secrets have to be created; after that it is minutes.

### 3.2 The one remaining laptop task

The Tauri Windows installer needs a Windows toolchain. **Do not let it block
anything.** Field's web PWA is the product; the desktop build is a bonus that
can be cut from the release or built later on a cloud Windows runner.

---

## 4. Architecture — where each thing runs

**The rule:** surfaces talk to the edge; the edge holds the keys; engines talk to
each other only through signed, schema-validated events. No app gets a backend
key, and no browser gets a secret.

```
  DEVICE            PWA (Field, Control) · OpenHub (Termux)     APK (Phone Beat, Studio, Concordance, companion)
                              │                                    │
  EDGE              Cloudflare Workers · D1 · KV · R2 · Cron · Access
                              │
  IDENTITY/DATA     Supabase Auth + Postgres + RLS        D1 (control plane)
                              │
  ENGINES           Modal (agent, referee, marketing)     AWS box (AetherDesk, OpenHub, Sieve)
                              │
  TRAINING          Kaggle (ephemeral, artifacts out)     S3/R2 (backups, models)
```

### 4.1 Provider matrix

| Provider | Owns | Must not own |
|---|---|---|
| **Cloudflare** | Public edge, Workers APIs, D1 control plane, KV rate limits, R2 media/backups, cron, PWA hosting | Long-running jobs, local SQLite apps, PHI |
| **Supabase** | Identity (single SSO), relational account data, RLS, storage | Per-app projects, PHI without a BAA, secrets in client code |
| **AWS** | The x86 always-on box: AetherDesk (its Fonoster stack is x86-only), S3 backups; Sieve/Recourse (or a heavy OpenHub session) if you do not use Oracle | Static sites, anything that belongs at the edge |
| **Modal** | Python/GPU burst: oncology agent, referee, marketing consumer, inference | System of record, durable state, secrets that only exist there |
| **Kaggle** | Training notebooks and datasets; artifacts exported out | Serving, cron, secrets, state you cannot rebuild |
| **Vercel** | Existing marketing sites (`uplift-*`, `overlay365.online`) | Anything with `node:sqlite`, a filesystem, or a long job |
| **IBM Cloud** | **Nothing by default** | A system of record, or a second copy of anything |
| **Oracle A1** (optional) | The free ARM operator box: OpenHub, Sieve, Recourse, LiteLLM | x86-only containers (AetherDesk/Fonoster), anything you cannot rebuild |

**IBM Cloud is the one to cut.** The active core is four providers; the rest are
single-purpose. Every extra one is a maintenance tax paid in logins, bills and
forgotten credentials. IBM Cloud has no purpose here at all. If there are
credits to spend, spend them on a stateless batch job or a demo — never on
something you would miss. Add it back only when a customer requires it in
writing.

**Vercel stays for what is already there.** Do not add a new surface to it; the
marketing console and OpenHub both need a real Node host.

### 4.2 Data classes

| Class | Examples | Lives | Rule |
|---|---|---|---|
| **Public** | Catalogue, field guide, marketing pages, release notes | R2 / Workers | Cacheable, no auth |
| **Account** | Profile, org membership, subscriptions | Supabase + RLS | Scoped by `user.sub` / `org_id`; never a client-supplied id |
| **Telemetry** | Counts, latency, outcomes, job runs | Sieve (D1/Postgres) | Aggregate only; no content, no identifiers |
| **Creative** | Audio takes, projects, `.ncbeat`, kits | Device SQLite / IndexedDB | Export (`zip`, `.ncbeat`) is mandatory; cloud is opt-in |
| **Clinical / PHI** | Case data, adjudication inputs, call transcripts with health content | **Device SQLite** by default | Server processing only inside a BAA; never in Sieve or marketing |
| **Secrets** | Keys, tokens, keystores | Infisical | Injected at deploy; never in a bundle, log, or repo |

The "privacy-based SQLite" line becomes a feature, not an accident: **the device
is the system of record for creative projects and clinical drafts; the cloud is
opt-in and aggregate.** That is a sentence you can put on the site.

### 4.3 One identity

Today there are at least two Supabase projects (Concordance
`ktphbqvoycurlyxieurv`, TruckBuddy `ennaghywpvlnprsqqzmq`) and two vaults
(Infisical, Keywire). Keep the split by product family — health/research and
trucking should not share a compliance boundary — but inside the app ecosystem:

- **one Supabase project** for auth and account data;
- **one Infisical project** for secrets;
- **one registry** (`wiring/registry.json`) for services.

### 4.4 The box

You need one always-on Linux host with **at least 8 GB RAM and 2 vCPU** if it
runs Sieve, Recourse, LiteLLM and the marketing console together. Today's
`t3.micro` is 1 GiB and cannot. OpenHub can run there for a heavy session, but
the phone is its primary home (§5.4).

Two honest options:

1. **Finish the Oracle A1 decision already recorded in `fleet-ops`.** Always
   Free ARM gives up to 4 OCPU / 24 GB at no cost. Caveats: capacity lottery,
   and x86-only images (AetherDesk's Fonoster stack) will not run on it.
2. **Resize the AWS instance** to `t4g.large` (8 GB) or `t3.large`. Roughly
   $50–60/month before storage. Reliable, x86, same account as AetherDesk.

Pick one. Do not run both "to be safe" — that is how a free box becomes a second
estate. AetherDesk's full stack wants 8 GB / 4 CPU per customer deployment
(`SAAS.md`), which is why customer-hosted is the default commercial model in §10.

### 4.5 Cost envelope

Order of magnitude, per month, before marketing:

| Line | Range |
|---|---|
| Cloudflare Workers Paid + D1/R2 | $5–20 |
| Supabase (Free → Pro) | $0–25 |
| AWS box + EBS + S3 | $10–70 |
| Modal (usage) | $0–100 |
| Vercel | $0–20 |
| CI (Codemagic/EAS free tiers) | $0–40 |
| Infisical + domains | $0–20 |
| **Total** | **~$100–300** |

Verify against the actual bills before promising a margin. The number that
matters is not the total; it is whether **one paying AetherDesk tenant covers
it** (it does at the pricing in §10).

---

## 5. OpenHub as the hub

**Decision: OpenHub is the work surface, not the runtime dashboard.** It owns
editing, loops, projects and assurance. Ecosystem Control owns "is it up, what
ran, what shipped". Sieve owns telemetry. Do not duplicate any of the three.

### 5.1 What exists

OpenHub is already a real console: React/Vite, Express, `better-sqlite3`,
Monaco, a WebSocket terminal, Axiom loops, Recourse over `:3050`, and a Fleet
page. Its `CONTROL_PLANE_PLAN.md` is explicit that autonomy never cold-starts
services and that five catalogs currently disagree.

### 5.2 The tool contract (v1)

Every ecosystem tool exposes the same five things. This is what "works with
OpenHub" means; it is not a plugin API.

| Requirement | Shape |
|---|---|
| Health | `GET /health` → `{ ok, service, version, build, at }` |
| Manifest | `GET /v1/manifest` → `{ id, name, version, capabilities[], auth, events }` |
| Versioned API | everything under `/v1/*`; breaking changes bump the path |
| Events | emits `overlay.ecosystem.event.v1` to Sieve (aggregate, no PHI) |
| Descriptor | `tool.json` in the repo, copied into `wiring/registry.json` |

```json
{
  "id": "sieve",
  "name": "Sieve",
  "surface": "web",
  "repo": "ncsound919/sieve",
  "health": "https://sieve.example/health",
  "api": "https://sieve.example/v1",
  "auth": "session",
  "capabilities": ["telemetry.read", "recall.search"],
  "events": "overlay.ecosystem.event.v1",
  "deepLinks": { "recall": "/sieve/recall?q={q}" }
}
```

**One registry, not five.** `CONTROL_PLANE_PLAN.md` lists five catalogs that
disagree (`MANAGED_SERVICES` 14, `FLEET_BRIDGES` ~20, `ecosystemRegistry` 43,
`start-all.ps1` 12, `ecosystem.config.json` 2). Generate the descriptor from
`wiring/registry.json` and have OpenHub and Control both read it. A catalog that
is maintained by hand will drift; one that is generated will not.

### 5.3 Per-tool integration

| Tool | How OpenHub uses it | The gap to close |
|---|---|---|
| **Recourse** | HTTP API at `:3050` behind `/api/recourse/*` | already integrated; add manifest + health identity |
| **Sieve** | read telemetry summary through the mobile gateway | no key in the browser; add a `/tools/sieve` panel |
| **Concordance** | start an adjudication loop; read artifacts and hashes | needs a typed client and the artifact schema |
| **Math X** | open the static build in a panel; run a proof check | needs a hosted build and a postMessage contract |
| **Agent Support** | memory context for prompts | **topology bug — see 5.4** |

### 5.4 The localhost problem (fix before building on it)

`openhub-memory-client.ts` calls `http://127.0.0.1:8765`. That works only if
OpenHub runs **on the same phone** as the memory service. If OpenHub runs on the
box and you open it in the phone's browser, `127.0.0.1` is the phone only for
client-side fetches — and a client-side fetch means the memory API is exposed to
every page in that browser. If the fetch is server-side, `127.0.0.1` is the
**box**, where nothing is listening.

So: **run OpenHub on the phone** (Termux, Node + `better-sqlite3` built for
ARM64). That is also the model you described — a coding environment in your
pocket. True loopback, no tunnel, no public exposure.

If you need the box's CPU for a heavy session, run a second OpenHub there and
reach the phone's memory through an authenticated tunnel (Tailscale or
Cloudflare Tunnel) with a bearer token — never by binding the memory service to
`0.0.0.0` and hoping the LAN is friendly.

Either way, add a bearer token. The current client has **no authentication
header**, which means any app or page on the device that can reach port 8765 can
read every memory block.

### 5.5 What OpenHub must not become

- A second service dashboard (Control owns that).
- A place where backend keys live in the browser.
- A launcher that cold-starts everything (the control-plane plan already forbids
  this; keep it).

---

## 6. Agent Support — memory that survives the phone

**Decision: the phone is the memory host; the cloud is an encrypted backup and a
review queue. Memory is never silently self-modifying.**

### 6.1 Current shape

The app exposes Letta-style blocks and vector search on `127.0.0.1:8765`, and
OpenHub injects them into prompts (`fetchAllBlocks`, `searchMemory`,
`buildMemoryContext`). It is an AI Studio scaffold with `applicationId
com.example`, a Qwen bridge and no `.env`.

### 6.2 Target shape

```
  Agent Support (APK, foreground service)
    ├── MemoryHttpServer :8765  (loopback + bearer, token in Keystore)
    ├── SQLite (encrypted at rest)
    ├── episode log (append-only)
    └── nightly: encrypted snapshot → R2  (age/SQLCipher, key in Infisical)
  Recourse (box)  ── consolidation proposals ──► review queue
  Sieve (edge)    ◄── counts/latency/outcome only, never content
```

Four things make it durable:

1. **Bind loopback, require a bearer token.** Generate the token on first run,
   store it in Android Keystore, show it once in Settings for pairing.
2. **Snapshot nightly.** Encrypt, upload to R2 with 30-day versioning. Restore
   to a new device is a first-class screen, not a hidden script.
3. **Cap and version every block.** `lastDriftScore` already exists in the
   client; enforce a maximum block size and a daily change budget.
4. **Rename the package before any data exists.** `com.example` is permanent and
   unpublishable. Do it first, while there is nothing to migrate.

### 6.3 The learning loop (Recourse → gate → memory)

```
episodes ──► Recourse consolidation ──► candidate diff
                                          │
                             gate: provenance, size, drift, contradiction
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
              auto-apply (low risk)                    review queue (identity,
              version++, old version kept               values, relationships)
```

Rules:

- **Ingested content is data, never instructions.** A paper, email or web page
  cannot write a memory block; it can only become an episode.
- **Every block write has provenance** (episode ids + model + timestamp).
- **Rollback is one command** and restores the previous version.
- **No change to identity/values blocks without a human.** This is the line
  between learning and drift.
- **Measure recall, not volume.** A memory that grows without improving recall
  is a token bill, not a brain.

### 6.4 Telemetry

Emit to Sieve: `memory.read`, `memory.write`, `memory.search`, latency, hit
count, drift score, snapshot success. **Never** block content, prompts, or
anything from a clinical draft. Sieve already refuses PHI at the edge; do not
rely on that as the only control.

### 6.5 Threat model

| Risk | Mitigation |
|---|---|
| Device lost/stolen | Encrypted DB + Keystore token + remote revoke of the R2 snapshot key |
| Another app reads `:8765` | Bearer token, loopback bind, rotate on pairing change |
| Prompt injection via ingested text | Treat as data; no instruction execution; provenance required |
| Memory bloat / cost | Size cap, relevance threshold, nightly compaction |
| Silent drift | Daily change budget, review queue, version history |
| Backup is unreadable | Restore drill once a quarter, on a spare profile |

**Exit criteria:** rename done, token enforced, snapshot restored on a second
device, 30 days of telemetry with zero content leakage.

---

## 7. Ecosystem Control — the one pane

**Decision: `ecosystem-control` is the dashboard. Extend it; do not build a
second one.**

It already does the hard part: 17 services, 7 jobs, 5 real cron triggers, a
dispatch allowlist, runs/commands/events, charts, and a phone PWA with a token
handover. What it cannot answer today is the question this plan is about:
**what shipped, and is it current?**

### 7.1 Add three tables

```sql
products(id, name, surface, repo, package, version, version_code,
         artifact_url, sha256, cert_sha256, channel, released_at)

releases(id, product_id, version, status, run_url, artifact_url,
         sha256, created_at)

alerts(id, ts, severity, source, code, message, ack_at)
```

### 7.2 Add four views

| View | Shows | Source |
|---|---|---|
| **Products** | Every app: surface, version, last release, hash, cert fingerprint | `products` |
| **Releases** | CI status per tag; a failed build is red, not silent | `releases` + CI API |
| **Alerts** | Cron failures, stale health, cert expiry, cost threshold, build drift | `alerts` |
| **Revenue** | Stripe MRR, AetherDesk tenants, kit sales | Stripe API (read-only key) |

### 7.3 The alerts that matter

Only five, or the inbox becomes noise:

1. A service is offline for two consecutive probes.
2. A cron did not run in 2× its interval.
3. A release build failed on a tag.
4. A TLS or domain certificate expires within 21 days (app signing keys are
   10,000-day; do not confuse the two).
5. Monthly spend crossed the budget line.

Every alert names the hop and the fix. "24 err" without a job name was the
original sin of this dashboard; do not repeat it.

### 7.4 Boundaries

| Question | Answered by |
|---|---|
| Is it up? What ran? What shipped? | **Ecosystem Control** |
| What am I building? What did the loop do? | **OpenHub** |
| What is the ecosystem doing across surfaces? | **Sieve** |
| What is the customer worth? | **Stripe / AetherDesk admin** |

### 7.5 Auth

`CONTROL_TOKEN` in `localStorage` is acceptable for one operator, but it is a
long-lived shared secret. Two cheap improvements: rotate quarterly, and add a
passkey/WebAuthn gate before the token is issued. Keep the `#k=` one-shot
handover — it solves a real phone problem.

---

## 8. Music — the label, the site, the radio

**Decision: the NC Sounds site is the label's front door; the DSPs are the music
storefront; the radio is a PWA, not an APK.**

### 8.1 What the label actually needs

A website is the easy part. A label needs five operational pieces:

1. **Catalog metadata** — title, artist, ISRC per track, UPC per release,
   release date, splits, territory.
2. **Delivery** — a distributor that issues ISRC/UPC, delivers to DSPs, and
   handles YouTube Content ID.
3. **Rights and splits** — who owns what, and who gets paid.
4. **Royalty accounting** — statements in, statements out.
5. **A public surface** — releases, videos, kits, apps, radio, contact.

For the first year, items 1–4 can live in a single `releases.json` plus a
spreadsheet; item 5 is the site. Do not build a label-management platform before
there are ten releases.

### 8.2 The site

`public/ncsound/` is already the right shape: no build step, no dependencies,
`content.json` as the only edit, routed on both hosts, excluded from the PWA
precache. It needs four things:

- **A real domain.** `overlay365.online/ncsound` is a path on a research site,
  not a label. Pick the NC Sounds domain and point it at the same build (or a
  Workers route). `ncsound.overlay365.online` has no DNS record today; do not
  advertise it.
- **A `/downloads` page** reading `downloads.json` (§2.3).
- **A privacy page** — required by every app that asks for the microphone, and
  by basic trust.
- **Real releases.** The empty albums/media sections are honest placeholders;
  fill them only when a release exists, with UPC/ISRC and a DSP link.

### 8.3 The radio station

`NCSound-Radio` exists on GitHub and is unhosted. Two viable paths:

| Path | What it gives | Cost / risk |
|---|---|---|
| **AzuraCast on the box** | Icecast + AutoDJ + scheduling + now-playing API + public player | ~1–2 GB RAM + track storage; you own the uptime; ARM/x86 both work |
| **Hosted radio SaaS** | Managed streaming, less ops | monthly fee; less control; migrate later is annoying |

Recommendation: **AzuraCast on the box**, with the PWA player on the label site.
The player is thin: HLS/MP3 stream + `/api/now-playing` + schedule. Do not build
a native radio app; background audio in a PWA is imperfect, but a station is a
"leave it playing" surface, and the install friction of an APK is worse than the
occasional browser pause.

**Licensing is not optional.** Streaming your own catalogue is one thing;
playing other people's records needs public-performance licences and, in the US,
SoundExchange for digital audio. Guest mixes need written clearance. Keep the
station to owned/original content until the licences exist.

### 8.4 Kits and commerce

The six kit families are a real product line. The smallest working store:

1. Stripe **Payment Link** per kit (no backend).
2. Success URL → a Worker that verifies the Stripe session and returns a
   short-lived R2 signed URL.
3. A licence file in the zip (personal vs commercial use).
4. Stripe Tax enabled for digital goods.

No cart, no accounts, no download manager in v1. One link, one file, one
receipt.

### 8.5 First 90 days of music

| Week | Do | Exit |
|---|---|---|
| 1 | Domain + `/downloads` + privacy page | Site loads on the label domain |
| 2 | Metadata for the first release (ISRC/UPC/splits) | `releases.json` has one real entry |
| 3 | Distributor live; first release scheduled | A DSP pre-save link exists |
| 4 | Radio on the box; now-playing + schedule | Stream plays for 24 h |
| 6 | First kit on Stripe | One real purchase, signed URL works |
| 8 | Content batch: 3 videos, 12 posts | Scheduled in the marketing arm |
| 12 | Review: streams, sales, email | One number that decides the next release |

---

## 9. Marketing — engine first, console second

**Decision: `marketing-arm` is the engine; the Overlay Marketing console is a UI
that does not exist yet and should wait.**

The arm is already live on Modal with 124 tests, nine product plans, a
fail-closed gate, a kill switch, per-product budgets, and an approval board at
`tap4500--marketing-arm-web.us-east.modal.run`. That is more than the console
has. Building the console first would create a second source of truth for
publishing state — the exact failure mode the arm's invariants forbid.

### 9.1 Scope, mapped to your words

| Your word | The concrete asset | Where it lives |
|---|---|---|
| Content generation | Daily drafts, 9 product plans, content packs | `marketing-arm` |
| Branding | Per-product brand spec, themes, OG images | `brand.py`, `/brand`, `/og/<product>.png` |
| Advertising | Campaign pages, figure cards, copy variants | `/site/<product>`, `/cards/*.png` |
| Marketing | Channel plan per product, budgets, hold/block rules | `MARKETING-PLANS.md` |
| Design | Design tokens per product, card renderer | `design-system/`, `cards/` |

### 9.2 What to add (small)

- A **brand registry** file: colors, type, logo, voice, banned claims, per
  product. One file the site, the arm and the console all read.
- A **campaign page per shippable product** — NC Sounds, AetherDesk, Phone Beat,
  NC Studio. The arm already renders these from a catalog.
- **One destination check** before any publish, already invariant I1. Point it
  at the new label domain.

### 9.3 When to build the console

Only when **two people** need to approve content, or when the arm's board cannot
show a campaign across products. Until then, the console is a second UI over the
same state, and every hour spent on it is an hour not spent shipping.

If it is built: it calls the arm's API (`/api/posts`, `/api/approve`,
`/api/publish`), holds no publishing state, and runs on the box (not Vercel —
`node:sqlite` needs a real filesystem).

### 9.4 What "ready" means here

Not "fully autonomous". It means: a week of posts drafts, gates, publishes and
records a platform id for every one, with zero blocked claims and zero dead
destinations. The arm's own metrics are the right ones.

---

## 10. AetherDesk — internal first, then B2B

**Decision: your own call center is the reference deployment; sell pilots, not
self-serve seats.**

### 10.1 What exists

FastAPI + Postgres + Redis + Fonoster/FreeSWITCH + Caddy, deployable as a
per-customer Docker stack (`docker-compose.saas.yml`), 8 GB / 4 CPU recommended,
with Stripe subscription hooks, consent capture, retention flags and encrypted
recordings. It is live on AWS and has 59/59 signal tests. The enterprise
benchmark is self-assessed at 31/40 with explicit caveats: no SOC 2, no BAA, no
independent pen test.

### 10.2 The unit economics problem

At $100–300/site/month, a dedicated 8 GB / 4 CPU stack leaves little margin:
that is roughly $50–120/month of compute before support, telephony and STT. The
model only works one of two ways:

1. **Customer-hosted** — the customer runs the stack in their cloud; you sell a
   licence + support + updates at **$250–500/month**. Best margin, best data
   residency story, slower sales.
2. **Managed shared tenant** — one larger box, `TENANT_MODE=multi`, small
   customers at **$150–300/month**. Better onboarding, harder isolation.

Pick per deal. Do not sell a dedicated stack at $100.

### 10.3 Three gates before revenue

| Gate | What must be true | Evidence |
|---|---|---|
| **Tenancy** | Cross-tenant reads are impossible and tested | org-scoped queries + RLS; a test that tries to read another tenant and fails |
| **Billing** | Seats and minutes meter into Stripe, with invoices | a test subscription and a metered invoice |
| **Trust** | Consent, retention, deletion, audit log, backups, status page | a one-page security summary a buyer can read |

If the buyer handles PHI, add a **BAA** and a HIPAA-scoped deployment. Do not
claim HIPAA because the code has encryption; the BAA and the audit are the
claim.

### 10.4 The pilot

1. Run your own call center on it for 30 days. Instrument: calls, disposition,
   conversion, minutes, cost per call.
2. Turn that into one page: "we ran N calls, handled M minutes, at $X per call."
3. Send it to 10 oncology labs/partner orgs; offer a 60-day pilot at a fixed
   price.
4. First paid pilot is the milestone, not the first demo.

### 10.5 90-day path

| Weeks | Do | Exit |
|---|---|---|
| 1–2 | Tenant isolation test + RLS on every table | A cross-tenant probe fails |
| 3–4 | Stripe meter + invoice + admin seat | A test invoice is correct |
| 5–6 | Security page, DPA, retention/deletion drill | A buyer packet exists |
| 7–10 | Internal 30-day run | Cost-per-call number |
| 11–12 | 10 outreach, 3 demos, 1 pilot | Signed pilot or a documented no |

---

## 11. TruckBuddy — a gate, not a build

**Decision: two weeks of validation before another line of code.**

What exists is real: three apps (dispatcher, cab, social), a shared Supabase
project with org-scoped ops tables, real JWT auth, 300 tests on AetherRoute,
honest metrics after the simulation was removed, and fixes for a PII leak, an
IDOR and a cross-tenant delete. That is a solid engineering base.

The site is already live and publishes a Fleet/Enterprise tier at **$129/month**
(Rev 2, 2026-10-28). That is a price on a page, not a validated price: no paying
customer is evidenced, and Samsara and DispatchTrack still quote privately, so
the market has not confirmed it. A published price is a hypothesis to test, not
a business.

**The gate (14 days):**

1. 10 dispatcher interviews — ask what they use, what breaks, what they pay.
2. 3 letters of intent or 1 paid pilot at the published price.
3. One workflow demo: assign → cab sees it → customer tracking link works.

**Kill criteria:** fewer than 3 LOIs, or a price below the cost of support. If
killed, park the repos and keep the domain; revisit when AetherDesk has revenue.

**If it passes:** narrow to "dispatch + driver cab + customer tracking for 5–50
truck fleets". Cut the social app from the paid product; it is a different
business with a different moderation burden.

---

## 12. The 90-day sequence

Ordered by dependency, not enthusiasm. Each phase has one exit; do not start the
next until it is true.

### Phase 0 — Foundations (week 1)

- Generate the four first-wave keystores (Phone Beat, NC Studio, Concordance,
  Companion); store in Infisical; record fingerprints. Agent Support gets its
  own in Phase 4.
- Rename Agent Support's `applicationId`.
- Publish Field's production environment; point a real domain at it.
- Add `downloads.json` + `/downloads` shell + privacy page to the label site.
- Add `surface` and `channel` to every entry in `wiring/registry.json`.
- **Exit:** a stranger opens the label site on a phone; you can restore a
  keystore from the vault.

### Phase 1 — Ship the audio line (weeks 2–3)

- **Phone Beat:** add `signingConfigs`, bump `0.4.0` / code 4, build signed APK,
  tag, release, add to Obtainium.
- **NC Studio:** wire the existing signing block to a real keystore, bump
  `1.3.1`, run the four device checks, release.
- **Field:** install-to-home-screen, deploy an update, confirm the new service
  worker takes over; cut `v1.2.0` on GitHub.
- **Exit:** three installable artifacts (two APKs + one PWA), one site, one
  proven update.

### Phase 2 — Build lane and hub (week 4)

- Set up Codemagic (or unblock GitHub Actions) with the three native keystores;
  a tag produces a signed APK with no laptop.
- Release Concordance on the same lane; put the **release** cert SHA-256 in
  `MOBILE_ANDROID_CERT_SHA256` and open one App Link on the installed build.
- EAS production profiles for the companion.
- Ship the merged companion via EAS: one package, two tabs (Observe / Remember).
- Run OpenHub on the phone (Termux) so the memory client is true loopback; if
  you also mirror it on the box, put that behind Cloudflare Access. Add the tool
  contract and a `/tools` page for Sieve, Recourse, Concordance, MathX, Agent
  Support.
- Tag the two Oncology tools that are consumed (Math X, field guide); leave the
  other eleven until they have a user.
- Fix the memory client: bearer token + loopback bind (OpenHub on the phone,
  §5.4).
- **Exit:** a signed APK is produced from a phone-triggered tag for all three
  native apps; OpenHub lists five tools with live health.

### Phase 3 — Control and marketing (week 5)

- Add `products`, `releases`, `alerts` to Ecosystem Control; sync GitHub
  releases; show cert fingerprints and versions.
- Point the marketing arm at the label site and AetherDesk; run one campaign per
  product; every published post has a platform id.
- Decide the console: defer (default) or build it as a client of the arm.
- **Exit:** the dashboard answers "what shipped, what is current, what is
  broken"; one campaign is fully auditable.

### Phase 4 — Agent runtime (weeks 6–7)

- Generate Agent Support's keystore and build the first signed APK (the
  package was renamed in Phase 0).
- Bind the memory service to loopback with a bearer token; pair it to OpenHub
  on the phone (true loopback), not a public port.
- Nightly encrypted snapshot to R2; restore it on a second device profile.
- Recourse consolidation behind the gate: provenance, size cap, daily change
  budget, review queue, one-command rollback.
- Sieve events for reads, writes, latency and drift — never block content.
- Add export and **forget** before the first real memory is written.
- **Exit:** the signed APK installs; a device swap restores memory; 30 days of
  telemetry; zero content in Sieve.

### Phase 5 — Revenue (weeks 8–12)

- AetherDesk: tenant isolation test, Stripe meter, buyer packet, internal
  30-day run, 10 outreach, 1 pilot.
- Radio live; first kit on Stripe; first release scheduled.
- TruckBuddy gate at the published price.
- **Exit:** one paying pilot **or** a documented no; radio streams 24/7; one
  kit sold.

### If you can only do one thing a week

1. Keystores.
2. Field production + domain.
3. Phone Beat signing.
4. `downloads.json` + page.
5. Codemagic tag build.
6. NC Studio + merged companion release.
7. OpenHub on the phone + tool contract.
8. Memory snapshot + bearer + restore.
9. Recourse learning gate + forget path.
10. Control products/releases view.
11. Marketing arm → label site.
12. AetherDesk tenant test + pilot outreach.

---

## 13. Operating rhythm

| Cadence | 20–60 minutes | Why |
|---|---|---|
| **Daily** | Glance at Control: alerts, failed jobs, overnight runs | Catch a dead hop before a user does |
| **Weekly (Mon)** | Release train: merge, tag, verify, update downloads | One cadence, not continuous deploys |
| **Weekly (Fri)** | Content batch: approve/rewrite held posts | The gate works only if the queue is cleared |
| **Monthly** | Cost review, backup restore spot-check, key rotation for one service | Keeps the estate from rotting silently |
| **Quarterly** | Kill list: park anything with no user and no revenue | Prevents the 54-repo problem from growing |

**The one rule that prevents the old failure mode:** a status is only "done"
when it was **observed**, not when it was deployed. "Production deployed" is not
"published"; "POSTED" without a platform id is not posted; a green test that
asserts simulated behaviour is not a passing test.

---

## 14. Risks, ranked

| # | Risk | Why it bites | Mitigation |
|---|---|---|---|
| 1 | **Keystore loss** | Permanent loss of update path for that app | Infisical + offline copy + printed fingerprint + restore drill |
| 2 | **Bus factor of one** | Phone lost = estate lost | Recovery doc, break-glass credentials in the vault, a trusted contact with the offline copy |
| 3 | **Provider sprawl** | Six clouds, six bills, six logins, forgotten resources | Cap at Cloudflare + Supabase + AWS + Modal; IBM zero; Vercel existing only |
| 4 | **PHI boundary erosion** | AetherDesk selling into health without a BAA is an existential legal risk | Device-local default; BAA-scoped deployment; Sieve refuses content |
| 5 | **Fake success** | The X poster / "deployed but unpublished" pattern | Dashboard reads live state; every success needs an id or an artifact |
| 6 | **Install friction** | No store means users bounce at the unknown-sources prompt | Clear `/downloads` instructions + Obtainium; measure installs |
| 7 | **Free-tier fragility** | Supabase pauses, Oracle reclaims, Modal cold starts | Paid tier for the one thing you depend on; health checks; backups |
| 8 | **Scope drift** | 12 surfaces is already too many for one operator | The kill list, quarterly |

---

## 15. Decisions only you can make

| # | Decision | Recommendation |
|---|---|---|
| 1 | One companion app or two? | **One APK shell** (Observe / Remember); EAS builds it |
| 2 | Which NC Sounds domain? | Pick one and 301 the path; do not run two |
| 3 | Operator box: Oracle A1 or resize AWS? | **Oracle if it provisions this week; otherwise `t4g.large`** |
| 4 | CI: Codemagic, unblock GitHub, or self-host? | **Codemagic**; it is the shortest path to a signed tag build |
| 5 | AetherDesk: internal-first or sell-first? | **Internal 30 days, then 10 conversations** |
| 6 | TruckBuddy: now or later? | **14-day gate now**; it is cheap to test and expensive to build blind |
| 7 | IBM Cloud: keep or park? | **Park**; one stateless demo at most |
| 8 | Keywire or Infisical? | **Infisical** as source of truth; migrate OpenHub off Keywire rather than running both |

---

## 16. Definition of done

| Layer | Done means |
|---|---|
| **App** | Signed artifact + version + hash + install page + update path + privacy page + telemetry + rollback |
| **Tool** | `/health` + `/v1/manifest` + registry entry + events + no secret in the client |
| **Dashboard** | Every product, service and job visible; five alerts; a failed build is red |
| **Agent** | Memory survives a device swap; every write has provenance; rollback works; zero content in Sieve |
| **Label** | Domain, one real release, radio, one kit, privacy page |
| **B2B** | Tenant isolation proven, Stripe invoice correct, a buyer packet, one paid pilot |

## 17. Kill list (do not build)

- A second dashboard.
- A second companion app.
- An F-Droid repo.
- An in-app APK updater.
- A self-serve AetherDesk signup before the first pilot.
- TruckBuddy Social as part of the paid product.
- Anything on IBM Cloud that holds state.
- A marketing console before a second approver exists.
- iOS builds before Android distribution is boring.

---

## Appendix A — release checklist (phone)

```
[ ] versionCode bumped; versionName set
[ ] CI tag app-vX.Y.Z pushed
[ ] build green; apksigner verify --print-certs passes
[ ] sha256 computed and attached to the release
[ ] release notes name the change and the test
[ ] downloads.json updated
[ ] install on a clean device profile (not an update)
[ ] update over the previous version (same key) — projects survive
[ ] App Link / deep link still opens the app
[ ] current release kept; previous two retained
[ ] dashboard shows the new version
```

## Appendix B — tool descriptor

```json
{
  "id": "concordance",
  "name": "Concordance",
  "surface": "apk",
  "repo": "ncsound919/concordance-app",
  "health": "https://concordance-web.tap4500.workers.dev/api/health",
  "api": "https://.../v1",
  "auth": "session",
  "capabilities": ["adjudicate", "capsule.mint", "registry.read"],
  "events": "overlay.ecosystem.event.v1",
  "deepLinks": { "anchor": "/concordance/anchor/{id}" },
  "release": { "package": "com.overlay365.concordance", "channel": "github" }
}
```

## Appendix C — evidence used

- [READINESS.md](READINESS.md) — per-app build, signing, distribution and ops
  evidence, 2026-10-28.
- [ECOSYSTEM.md](ECOSYSTEM.md) — live inventory and folder map.
- [CRONS.md](CRONS.md) — scheduled jobs and cloud cadences.
- [KAGGLE.md](KAGGLE.md) — training kernel status.
- `eco/wiring/registry.json` — 17 services, auth schemes, health paths.
- `eco/ecosystem/ecosystem-control/README.md` and `docs/API.md` — the live
  control plane and its contract.
- `eco/ecosystem/openhub/README.md` and `CONTROL_PLANE_PLAN.md` — hub surface
  and lifecycle rules.
- `eco/ecosystem/marketing-arm/README.md`,
  `OPERATING-MODE.md`, `MARKETING-PLANS.md` — the publishing engine.
- `eco/site and marketing/Aetherdesk-Call-Center-git/SAAS.md` and
  `ENTERPRISE_READINESS_BENCHMARK.md` — deployment model and gaps.
- `eco/ecosystem/wiki/raw/lessons/2026-10-07-truckbuddy-*` — TruckBuddy audits.
- `eco/ecosystem/fleet-ops/PHONE-OPS.md` — the no-laptop lane and its limits.

**Not verified in this pass:** no APK/AAB was built, no CI was run, no live
endpoint was probed. The plan is derived from the audit record and the repo; the
first execution of each phase is what turns it into evidence.

**Service picks that are judgment calls, not catalog-verified:** the Gravity
Index returned no entry for mobile CI or for radio streaming, so Codemagic and
AzuraCast are recommendations to validate, not installed choices. Confirm the
current free-tier minutes, ARM support and streaming licence before committing
money to either.
