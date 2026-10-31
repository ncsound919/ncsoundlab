# Scheduled work — cloud crons and phone blocks

Two different things, deliberately kept apart:

- **Cloud crons** — jobs that must run whether or not you touch anything. They
  live in the host that owns the work (Cloudflare, GitHub Actions, Modal).
- **Phone blocks** — the recurring human schedule. This is not automation; it is
  the slot where the automation's output gets read.

Timezone below is **America/New_York**. Nothing here is created yet — this is
the plan plus the exact config to paste.

---

## 1. Cloud crons

### 1.1 What must run, and how often

| # | Job | Where it must run | Schedule | Cost | Why this cadence |
|--:|---|---|---|---|---|
| 1 | `wiring/check-live.mjs` — every registered hop answers | GitHub Actions | `17 */6 * * *` | free | 4×/day catches a dead engine within hours; more often just makes noise |
| 2 | `wiring/check-contracts.mjs` — quoted client paths still exist in the deployed OpenAPI | GitHub Actions on push | push + `/pull_request` | free | Contract drift is a merge-time problem, not a clock problem |
| 3 | `wiring/verify-parity.mjs` — agent and engine agree on a report | GitHub Actions | `41 3 * * 1` (Mon 03:41) | free | Needs both keys and a clean network; weekly is enough to catch a silent divergence |
| 4 | `wiring/check-contracts.mjs --refresh` — re-pull snapshots | GitHub Actions | `9 4 1 * *` (1st, 04:09) | free | Monthly diff of the snapshot **is** the alert that someone changed a deployed contract |
| 5 | `mobile-gateway` `/health` | Cloudflare Worker cron | `*/15 * * * *` | free | The mobile apps depend on it; a Worker cron probe is cheaper than an uptime service |
| 6 | Supabase row export (anchors, claims, subscriptions) | GitHub Actions | `23 5 * * *` | free | Daily logical backup. Supabase's own PITR is a paid tier; this is the free insurance |
| 7 | Kaggle kernel poll — terminal state of every open run | Your PC (local server) | every 30 min while training | free | Only needed during a training push; disable it after |
| 8 | Marketplace tool health (`math-x` etc. resolve) | GitHub Actions | `53 6 * * *` | free | A dead tool link on a public marketplace is the most visible kind of rot |

**Do not** put `verify-parity` on a short loop. It runs a real audit and is the
one check that costs money per call.

### 1.2 GitHub Actions — one workflow, four triggers

Create `.github/workflows/wiring.yml` in the **wiring** repo (not in every app):

```yaml
name: wiring

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '17 */6 * * *'   # check-live
    - cron: '41 3 * * 1'     # verify-parity
    - cron: '9 4 1 * *'      # refresh contracts

concurrency:
  group: wiring-${{ github.ref }}
  cancel-in-progress: true

jobs:
  contracts:
    if: github.event_name == 'push' || github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: node wiring/check-contracts.mjs
      - run: node wiring/test-signal-hop.mjs
      - run: node --test wiring/cloudflare/marketing-signal-gateway/worker.test.mjs

  live:
    if: github.event_name == 'schedule' || github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: node wiring/check-live.mjs          # never --allow-fallback in CI
        env:
          AGENT_API_KEY: ${{ secrets.AGENT_API_KEY }}
          REFEREE_API_KEY: ${{ secrets.REFEREE_API_KEY }}
```

Two rules that matter more than the YAML:

- **Never pass `--allow-fallback` in CI.** A fallback answering is not the
  contract answering; the README is explicit that this is a local diagnostic only.
- **Exit code `2` is not a pass.** `verify-parity` returns `2` when it *could not
  run* (missing key, filtered network). Treat `2` as a failing job or you will
  believe a check that never executed.

### 1.3 Cloudflare Worker cron — gateway health

`wiring/cloudflare/mobile-gateway/wrangler.jsonc`:

```jsonc
{
  "name": "mobile-gateway",
  "main": "src/index.ts",
  "triggers": { "crons": ["*/15 * * * *"] },
  "observability": { "enabled": true }
}
```

In the Worker, branch on `controller.cron` and do one probe per hop rather than
one big `Promise.all` — a single hung upstream should not mask three healthy ones:

```ts
async scheduled(_event, env, ctx) {
  ctx.waitUntil(
    Promise.allSettled([probe(env.SIEVE_URL), probe(env.RECOURSE_URL), probe(env.AETHERDESK_URL)])
      .then((results) => logFailures(results)),
  );
}
```

A Worker cron cannot send you a notification by itself; write the result as one
`overlay.ecosystem.event.v1` event into Sieve (`source: 'mobile-gateway'`), so
phone downtime shows up in the same 24-hour summary you already read.

### 1.4 Kaggle polling — where it belongs

The Kaggle credential must stay on one machine. Correct shape:

```
phone (Sieve/Recourse)  →  mobile-gateway  →  KAGGLE_STATUS_URL  →  your PC
                                                                     └─ Kaggle API
```

- On the PC, the poll runs every 30 minutes **only while a training push is
  active**. A cron that runs forever burns your Kaggle quota on nothing.
- The dashboard was **down during this audit** (`127.0.0.1:8099` gave no
  response) even though a previous session reported PID 17260. Restart:

  ```bash
  cd "C:\Users\tap45\Downloads\Overlay Marketing\kaggle-trainer-app\backend"
  python -m uvicorn main:app --host 0.0.0.0 --port 8099
  ```

- Do not add a cron for it until the model work in `KAGGLE.md` is finished.
  Polling a dashboard is not progress.

### 1.5 What should *not* be a cron

| Tempting job | Why not |
|---|---|
| Auto-deploy on push | Field, the Workers and the Android apps have different blast radii. Deploy deliberately |
| Auto-rotating API keys on a timer | `wiring/rotate.mjs` exists; rotation outside an incident is how a live client breaks at 3 a.m. |
| Daily re-audit of every tool | Audits are expensive and the verdicts barely move. Run one on release |
| Scraping your own analytics hourly | Nothing acts on it at that resolution |

---

## 2. Phone blocks

The point of these is that nothing above requires you to remember it. Each block
has one job and a place to record the outcome.

| When | Block | Length | Do exactly this |
|---|---|---|---|
| **Daily 07:30** | Triage | 10 min | Open Field → kit library. Open the hub. Read the Sieve 24h summary. If a cron failed overnight, it is here |
| **Daily 21:00** | Capture | 20 min | Record one idea in Field. Pre-roll means the good take is already caught. Save it, add to a kit |
| **Mon 08:00** | Release check | 20 min | Is Field production up? Did the Play internal track install? Anything red in Actions? |
| **Wed 08:00** | Build window | 60 min | One app from `READINESS.md`, one step only. The list is ordered; do not reorder it |
| **Fri 17:00** | Ship | 30 min | Publish whatever passed. Nothing half-done gets published on a Friday |
| **1st of month** | Contract refresh | 15 min | Read the `check-contracts --refresh` diff. A diff means a deployed contract moved |

Rules that keep this honest:

- **One app per week.** You have ten. Parallel work is why four are at 50%.
- **The Friday block is the only one allowed to publish.** Everything else is
  preparation.
- **Nothing is scheduled during a training run's first hour.** Kernel start-up
  failures are the most common failure and they are visible immediately.

### 2.1 Getting it onto the phone

Pick one and keep it there:

- **Google Calendar** — six recurring events, each with the app name in the
  title. Simplest, syncs everywhere, works with your existing account.
- **Tasks/reminders** — better for one-off steps like "install from internal
  testing", worse for the standing rhythm.
- **Do not build an in-app scheduler for this.** A cron in your phone app is a
  feature you would then have to maintain; the calendar already exists.

If you want them created: say the word and I will write the six events into your
Google Calendar with the details above in each description.

---

## 3. One-time setup that is not a cron

Do these once, or every cron above is decoration:

1. **`AGENT_API_KEY` and `REFEREE_API_KEY` as GitHub secrets.** `check-live` and
   `verify-parity` skip their authenticated probes when the variable is unset —
   a skipped probe exits 0 and looks like a pass.
2. **A network that can reach `overlay365.online`.** This LAN's content filter
   blocks it (`302 → block.charter-prod.cujo.io`, TLS reset). CI on GitHub
   runners is not filtered, which is another reason the checks belong there.
3. **Alert delivery.** A red Actions run nobody sees is not monitoring. Turn on
   GitHub's failure notifications for the wiring repo, at minimum.
4. **A backup destination you have restored from once.** `#6` above is only a
   backup if you have proven a restore.
