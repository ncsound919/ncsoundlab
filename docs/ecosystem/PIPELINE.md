# The pipeline: from working to provable to posted

One loop, run per tool, until every tool is at beta. It exists because the audit
(`READINESS.md`) found the same thing everywhere: **the tools work and there is no
proof.** This pipeline manufactures the proof and then uses it.

The loop is not a process document. Every stage has a command, an artifact and a
gate you can check from a phone.

---

## 1. The loop

```
   ①  MEASURE          node scripts/ecosystem-audit.mjs --verbose
        │              → audit-report.json
        ▼
   ②  FIX TRUTH        remove or finish every dead control
        │              gate: dead controls = 0
        ▼
   ③  DEEPEN TESTS     tests on the critical path, not everywhere
        │              gate: modules exercised ≥ 40% AND path covered
        ▼
   ④  PROVE IT         version + changelog + AUDIT.md + evidence run
        │              gate: release-evidence/<tool>.json exists, versioned
        ▼
   ⑤  WALK IT          one end-to-end workflow, on the phone, written down
        │              gate: one sentence that survived contact with reality
        ▼
   ⑥  SAY IT           evidence → Overlay Marketing → approved content
        │              gate: a human approves; safeClaims only
        ▼
      BETA TAG  ──►  back to ①
```

Two rules keep it honest:

- **You may not skip to ⑥.** Marketing from an unmeasured tool is how you end up
  claiming something the code does not do.
- **A stage that fails sends you back, not forward.** There is no "mostly done".

---

## 2. Stage detail

### ① Measure

```bash
# from the Field repo
node scripts/ecosystem-audit.mjs --verbose
node scripts/ecosystem-audit.mjs --export=audit-report.json --evidence=release-evidence
```

`--verbose` prints the findings you act on: dead controls with file:line, modules
with no test beside them, what proof exists, what it connects to.

Cost: seconds. Run it before and after every stage — the delta is the only
evidence of progress you will have.

### ② Fix truth

Every hit from the sweep is one of three things. Decide which, in this order:

| Finding | Do |
|---|---|
| The control is not needed | Delete it. A missing button is honest; a dead one is a lie |
| The control is needed but unfinished | Finish it, or disable it **visibly** with "not in this build" |
| The hit is a false positive | Fix the pattern in `scripts/ecosystem-audit.mjs`, not the code |

That third row matters. The scanner produced 15 false stubs in Field and 39 in
Oncology on its first run. A pattern you keep suppressing instead of fixing
poisons every future measurement.

**Gate:** `dead controls = 0`, or every remaining one carries a visible "not in
this build" and is listed in the changelog.

### ③ Deepen tests

Not 100% coverage — that is a trap for a solo operator. Test the path a person
walks:

```
open  →  do the one job  →  save  →  close  →  reopen  →  the work is still there
```

For each tool that means, concretely:

| Tool | Critical path |
|---|---|
| Field | capture → chop → evolve → save → export `.ncbeat` → reopen |
| Phone Beat | load project → pattern → save → export → reopen |
| NC Studio | import `.ncbeat` → mix → save → reopen |
| Concordance | open anchor → adjudicate → sync → conflict → resolve |
| Sieve | sign in → recall query → telemetry summary → token refresh |
| Recourse | sign in → recall → store episode → retrieve |
| Agent Support | task → memory write → recall next session → redact |
| Math X | expression → evaluate → prove → export |
| Marketing | ingest snapshot → review → approve → publish |

**Gate:** modules exercised ≥ 40% *and* every step of the path above has at least
one test. Ten tools now clear the module gate. Oncology is the exception: its
aggregate is 18% because one entry bundles twenty apps, not because the core is
untested (`platform/lib` reads 63.5%). Score the products separately before
treating that number as a test backlog.

### ④ Prove it

Three artifacts, all cheap, and this is the stage nobody has ever completed:

1. **`CHANGELOG.md`** — one line per version, dated, saying what changed and why.
   Concordance's is the model to copy.
2. **`AUDIT.md`** — what you checked, on which commit, with what result. Math X's
   format is the model: claim, snapshot, verdict, evidence path. A failing audit
   written down is worth more than a passing one asserted.
3. **`release-evidence/<slug>.json`** — generated, never hand-written:

```bash
node scripts/ecosystem-audit.mjs --evidence=release-evidence
```

**Gate:** all three exist and the evidence file's `version` matches the code.

### ⑤ Walk it

One full trip through the tool on the phone. Then write one sentence:

> "Recorded a take, chopped to 4, evolved 8, kept 2, exported `.ncbeat`,
> imported into NC Studio, played back."

If the sentence needs a caveat, the tool is not beta. Also record the six manual
checks from `READINESS.md` §5 — cold start, loss recovery, offline, error
legibility, one-handed reach, the 30-second explanation.

**Gate:** one sentence, no caveats, plus six answers.

### ⑥ Say it

The evidence file is the *only* permitted source for marketing claims. See §3.

**Gate:** a human approves before anything publishes.

---

## 3. The marketing loop

`release-evidence/*.json` is the contract between what was measured and what gets
said. Shape:

```jsonc
{
  "schema": "overlay.release_evidence.v1",
  "slug": "sieve",
  "version": "v0.1.0",
  "operability": { "score": 47, "breakdown": { ... } },
  "measured": { "testFiles": 2, "moduleCoveragePct": 6.1, "deadControls": 0 },
  "proven": ["changelog"],
  "connectsTo": ["deep links"],
  "safeClaims": [
    "no dead controls found by automated sweep",
    "2 test files, 6.1% of modules exercised"
  ],
  "unsafeClaims": []
}
```

`unsafeClaims` is the important field. When the audit finds dead controls it
populates that list, and the console must refuse to generate completeness copy
from that tool. **The claim is generated from the measurement, so it cannot drift
from it.**

### What the marketing engine does with it

**Target the engine, not the console.** `MASTER-PLAN.md` §9 makes `marketing-arm`
the publishing engine and defers the Overlay Marketing console until two people
need to approve content. Work the loop against the arm; feed the console later
if it is ever un-deferred.

Whichever one publishes, its stated job — content generation, branding,
advertising, design — becomes mechanical instead of blank-page:

| Input | Output |
|---|---|
| `lastClaim` + `measured` | A changelog post: what changed, how many tests, what it connects to |
| `safeClaims` | Feature cards and site copy that cite a number instead of asserting a benefit |
| `connectsTo` | Workflow narrative ("Field → Phone Beat → NC Studio → Pro Tools") |
| `version` | Release note title and a tag |
| `unsafeClaims` non-empty | **Blocks** the release post and prints what to fix first |

Then the existing approval gate does its job: draft → human review → publish.
The arm already has that board; what it lacked was a measured input, and this is
the input.

**Why this ordering matters:** the marketing side is the only place where a claim
can outrun the code, and it is the last stage for exactly that reason. Evidence
first means the release post is a *report*, not a promise — and `unsafeClaims`
becomes a hard stop instead of a note nobody reads.

---

## 4. What runs where, from the phone

Nothing here should require a laptop.

| Step | Runs on | You do |
|---|---|---|
| Audit | GitHub Actions on push, or the control board | Tap once, read the table |
| Tests | CI | Read pass/fail |
| Build / APK | CI | Download from the run page |
| Evidence | CI, committed back | Nothing |
| Manual walk | **Phone** | Actually use it |
| Marketing | Console (needs a phone-viewable surface) | Approve or reject |
| Deploy | Control board | Confirm |

Two things must exist for this to be true, and neither does yet:

1. **CI that runs the audit and commits the evidence.** One workflow, all repos:
   ```yaml
   - run: node scripts/ecosystem-audit.mjs --export=audit-report.json --evidence=release-evidence
   - run: git diff --exit-code release-evidence || echo "evidence changed"
   ```
2. **A phone-readable view.** The audit's table is the right shape and there is
   no reason it should be terminal-only. A single page reading
   `audit-report.json` — score, dead controls, proof present, last version — is
   the "ecosystem control" surface, and it is a day of work, not a project.

Until those exist, the loop still runs — you just run it by hand and the phone is
a consumer rather than an operator.

---

## 5. Order

Don't run the loop on ten tools at once. Sequence by leverage:

| # | Tool | Why now | Loop cost |
|--:|---|---|---|
| 1 | **Field** | 90, 76% modules, best handoff; only its own audit/result/security records are missing | Hours |
| 2 | **Phone Beat** | 92, 54% modules; the `.ncbeat` chain is the product | Hours |
| 3 | **NC Studio** | 91, 97% coverage; needs a README and a device run | Hours |
| 4 | **Concordance** | 90, 88% coverage; the one dead control and handoff are the work | Hours |
| 5 | **Agent Support** | 93, 100% modules; needs identity + the memory loop verified | Days |
| 6 | **Math X** | 92, 100% modules; needs a live provider run and a phone walk | Days |
| 7 | **Wiring** | 92, 100% modules; add the one HTTP probe route so the phone can run it | Hours |
| 8 | **Marketing** | 90, 100% modules; feed it from the other tools | Days |
| 9 | **Sieve + Recourse** | 90/91 but 44–48% modules; merge them, then deepen coverage | Days |
| 10 | **Oncology** | 77 aggregate; score the products separately before chasing the number | Weeks |

Items 1–4 and 7 are close to **proof-only** — the code is already fine and the
work is writing down what happened and walking the path once. Start there; it is
the fastest way to make the ecosystem feel operable. Oncology is last because
its number is a scope problem, not a code problem.

---

## 6. What "fully ready" looks like

Not "finished". Finished never happens. Ready means:

- Every tool has a version, a changelog and an evidence file, regenerated on
  every change.
- The audit sweep is clean, and when it is not, the finding is written down
  rather than suppressed.
- The critical path of each tool is tested, so a refactor cannot silently break
  the one workflow you depend on.
- Every tool's status is visible on a phone in one screen.
- Marketing claims are generated from evidence, so nothing gets said that was not
  measured.
- A beta is a thing you cut on a Friday because the gates were green, not a mood.

At that point the constraint stops being readiness and becomes **which tool is
worth the next hour** — which is a far better problem, and the only one the plan
in `MASTER-PLAN.md` cannot answer for you.

---

## 7. How this pipeline fails

Honest failure modes, because a pipeline that only works when everything goes
right is a pipeline you will abandon in three weeks:

| Failure | Symptom | Fix |
|---|---|---|
| **Gate inflation** | You start calling a partial pass a pass | The gate line in this file is the gate. If it changed, change it here first |
| **Measuring instead of building** | You run the audit repeatedly and nothing ships | Audit before and after. Never in between |
| **Suppressing the scanner** | A finding gets a `// eslint-disable` instead of a fix | Fix the pattern in the script, not the code it flagged |
| **Proof theatre** | `AUDIT.md` files that say "all good" | An audit records what you checked and what failed. Math X's FAIL is the good example |
| **Marketing outrunning evidence** | A post claims something the audit never measured | `unsafeClaims` blocks it. If you bypass that field once, delete the field |
| **Ten loops at once** | Everything at 60%, nothing at beta | §5 order. One tool until it tags |
