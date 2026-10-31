# Operability & beta readiness

**Revision 6 · 2026-10-28.** Generated from
[`scripts/ecosystem-audit.mjs`](../../scripts/ecosystem-audit.mjs) — not from
opinion. Re-run it any time; the numbers below are reproducible.

```bash
node scripts/ecosystem-audit.mjs --verbose
node scripts/ecosystem-audit.mjs --export=audit-report.json --evidence=release-evidence
```

Rev 6 adds the two surfaces that were outside the score — Concordance OSS and
AetherDesk Mobile — and moves Field to its standalone home. All three are now
measured: 96, 91 and 92. Twelve of thirteen tools are at or above 90; Oncology
is the one exception, and it is a monorepo measurement, not a failing product.

> **Rev 3 dropped distribution entirely.** The question is not store listings.
> It is: *can I run this, alone, from my phone, and prove it works?*

---

## 1. The score

Six axes, 100 points: **stubs 25 · test depth 25 · provability 20 · handoff 15 ·
phone 10 · visibility 5.**

| Tool | Score | Stubs | Tests | Modules | Prove | Handoff | Phone | See |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **Concordance OSS** | **96** | 25 | 23 | 85% | 20 | 15 | 9 | 4 |
| **NC Sound Lab / Field** | **92** | 25 | 22 | 81% | 20 | 15 | 7 | 3 |
| **NC Phone Beat** | **92** | 25 | 18 | 53% | 20 | 15 | 9 | 5 |
| **Agent Support** | **92** | 25 | 21 | 99% | 20 | 12 | 9 | 5 |
| **Math X** | **92** | 25 | 22 | 100% | 20 | 15 | 7 | 3 |
| **Wiring layer** | **92** | 25 | 25 | 100% | 20 | 15 | 2 | 5 |
| **NC Studio** | **91** | 25 | 23 | 97% | 18 | 12 | 9 | 4 |
| **Recourse mobile** | **91** | 25 | 17 | 47% | 20 | 15 | 9 | 5 |
| **AetherDesk Mobile** | **91** | 25 | 18 | 100% | 20 | 15 | 9 | 4 |
| **Concordance** | **90** | 25 | 23 | 87% | 20 | 8 | 9 | 5 |
| **Sieve mobile** | **90** | 25 | 16 | 43% | 20 | 15 | 9 | 5 |
| **Overlay Marketing** | **90** | 25 | 25 | 100% | 20 | 12 | 7 | 1 |
| **Oncology Ecosystem** | **78** | 25 | **10** | 18% | 20 | 12 | 7 | 4 |

**Average: 91/100.** Twelve of thirteen tools are at or above the 90 target.

---

## 2. What changed in this pass

**The tools were not hollow.** The dead-control sweep is clean for twelve of
thirteen tools. Oncology's five remaining markers are one docs script and four
markers in bundled/standalone projects, not the platform's shipped modules.

**Test depth was the real gap, and it was closed where it was cheap:**

| Tool | Tests before | Tests now | What was added |
|---|--:|--:|---|
| Overlay Marketing | 0 | 37 | Ingest auth/validation/upserts, approvals, Postiz client, SQLite schema, every page, health |
| Wiring layer | 1 file | 78 + 16 Python | Every Worker, rotation, live probe, parity, signed hop, receiver, both Modal services |
| Math X | 20 files | 195 | Every API router, every package module, every component and worker module, the entry point |
| NC Phone Beat | 128 | 128 + integration | Local analytics, contract mirrors, deep-link validation; native suite counted |
| Recourse | 12 files | 66 + module tests | New modules named in tests |
| NC Studio | 51 files | 356 | Full forced run, audit records |

**Proof is now near-universal.** Every tool has a changelog and an evidence
record; the app surfaces also have an audit record, a result/metrics record and
a deploy-readiness checklist. Field has all four after extraction. AetherDesk
carries a security policy; Field does not yet. The only other missing artifact is
a root `LICENSE` on some tools — a business decision, not a score to chase.

**Phone reach improved.** Math X and Oncology now ship web manifests and install
standalone; Marketing's console is installable too. The wiring layer remains
2/10 because it is a Node CLI: it is meant to be run by a scheduled job or the
control plane, not by thumb.

---

## 3. The one tool that is not at 90: Oncology (78)

This is the important number to understand rather than chase.

The Oncology entry is a repository of **twenty independently developed apps**,
not one service. Its 1,395 counted modules (after excluding vendored upstream
code and the separately scored Math X) include `platform/` (the 13-tool
workbench), `apps/oncology-agent`, `apps/concordance-web`, and standalone
projects (`prometheus`, `Onconosim`, `AncestralMT`, `Cellular-Map`,
`fieldbridge`).

The structural metric asks "is there a test file named after this module".

- `platform/lib` — the statistical and evidence core — reads **63.5%**.
- `apps/oncology-agent` has a large test tree, but names tests by route, so
  exact-name matching reads far below what those tests exercise.
- The standalone apps have no suites at all.

Raising the aggregate to 90 means tests for roughly **1,100 modules**, most of
them UI routes and separate prototypes. That is weeks of test writing, not a
configuration change, and it would be dishonest to record it as anything else.

What would actually move it, in order:

1. **Score the products separately.** The ecosystem is at least five products;
   one entry hides the difference between the 63.5% core and untested spin-offs.
2. **Import-smoke suites** for `platform/app` and `apps/oncology-agent/app`
   (real tests that load every module).
3. **Route tests named after the module they cover** in the agent, so the
   existing 93 files count.

Until then, Oncology's 78 is recorded as a structural measurement of a bundled
repository, not as a claim that the core is 78% ready.

---

## 4. Beta definition (unchanged)

A version is beta when all five are true:

1. **Zero dead controls** — the audit sweep is clean.
2. **The critical path is tested** — `% modules exercised` ≥ 40% and every step
   of open → do the job → save → reopen has a test.
3. **An evidence file exists** — `release-evidence/<slug>.json`, generated, with
   a version.
4. **One end-to-end workflow verified on the phone**, written as one sentence.
5. **A changelog entry** naming what changed since the last beta.

**Criterion 4 is the one still universally missing.** No tool has a written
sentence describing one real run on the phone. That cannot be replaced by more
unit tests and is the next piece of work.

---

## 5. Manual checks the script cannot do

The audit measures structure, not feel. These need you on a phone:

| Check | Why |
|---|---|
| One-handed reach | Are the primary actions in the bottom third? |
| Cold-start time | How long from icon tap to usable? |
| Loss recovery | Kill the app mid-task. What survived? |
| Offline behaviour | Airplane mode, then do the core job |
| Error legibility | Break the network. Is the message a sentence or a code? |
| **The 30-second rule** | Can you explain what the app is for in 30 seconds without notes? |

Do these once per beta per app and write the answers next to the changelog entry.

---

## 6. What this audit does not measure

- **It does not measure whether the feature is the right feature.**
- **Module coverage is structural, not line-level.** It asks whether a test
  exists by name, with a bounded package fallback for parallel test trees. It is
  not a line-coverage percentage and must not be quoted as one.
- **Coverage groups are explicit.** Where a single suite imports a whole tree
  (Math X packages, API modules, components, workers), the link is recorded in
  `scripts/ecosystem-tools.json` and the suite imports every module it claims.
- **Four measurement bugs were fixed in Rev 5:** pytest's `test_*.py` convention
  is now a test, `.wrangler` build output is no longer source, a nested
  `apps/*/public` manifest counts as a phone surface, and Math X's stale root
  duplicates are excluded with the reason recorded in the tool config.
- **Suites run in this pass:** Marketing 37, Wiring 78 Node + 16 Python,
  Math X 151 web + 44 API, Phone Beat Gradle + native audit, plus the audit
  script itself. The other tools' scores describe files present and their last
  recorded run; Oncology's suite and the standalone apps were **not** run in
  this pass and their structural score is not a passing-test claim.
- **Dead-control detection is pattern-based.** A button wired to a function that
  silently does nothing is not caught — that is what the manual checks are for.
- **Vendored code is excluded by explicit list**, not detected automatically.

**Not audited at all** — no entry in `scripts/ecosystem-tools.json`:

| Surface | State as checked today |
|---|---|
| **Ecosystem Control** | `ecosystem-control.tap4500.workers.dev` → **200**, live |
| **`marketing-arm`** | Named as the publishing engine in `MASTER-PLAN.md` §9; its root URL returns **404**, so neither the board nor the claimed 124 tests could be confirmed from here |
| **OpenHub** | No local path supplied |
| **AetherDesk** (+ mobile) | `api.overlay365.online` filtered on this LAN; no source path |
| **TruckBuddy** | Live at `truckbuddy.online`; treated as a separate venture |
