# NC Sound Lab — Command Center Integrations (Blueprint)

**Goal:** Extend NC Sound Lab from a production tool into a producer command
center by adding four integrations that share one action/undo foundation:
stem separation via a bundled UVR sidecar, a bring-your-own-model LLM provider
layer, a natural-language command surface over the existing action registry,
grounded auto-name/tagging, and an ops/session hub.

**Status:** Planning · **Ownership:** opencode session · **Last updated:** 2026-09-17
**Scope note:** SoundLab is **free and open source (Apache-2.0), no paid tier**.
Stem separation (Phase 0/1) is **deferred**. Optional Recourse integration
(music + self-learning) is **Phase 6 — see §8**. MIDI controller partner
platform is **Phase 7 — see §15**. Pre-work remediation backlog in **§14**.

**Done so far (2026-09-17):**
- P0 §14 item 1-4: undo/redo core fixed (off-by-one, phantom `canUndo`,
  redo-kill, transaction coalescing) with restoration regression tests.
- §14 item 17: autosave now persists **and restores** the master rack.
- §14 item 23: rating export envelope is now a consistent, hash-bearing
  per-session snapshot.
- §14 item 19: paid tier removed — demo/paywall modules deleted, app ungated.
- License audit: **all dependencies are permissive** (MIT / Apache-2.0 / BSD-3 /
  ISC / MPL-2.0). No GPL/AGPL. See §15 licensing policy.
- §14 item 5 / **Phase 2.2**: undo snapshot extended with `arrangement`, `buses`,
  `layerSends`, `masterDynamics`, `sidechains`, plus `snapshotsEqual`
  comparisons and the App applier + commit-effect wiring.
- §14 item 6: CSP `connect-src` now permits the local Recourse origin in all
  four configs (`tauri.conf.json`, `vercel.json`, `.headers`, `nginx.conf`).
- **Phase 2.1**: typed action registry (`src/lib/actions/registry.ts`) — param
  specs, canonical control ranges, `specForAction`, `clampParam`,
  `validateActionArgs` (21 tests, 98.8% statement coverage).
- §14 item 7 **resolved by Phase 3.1**: secrets are owned by the local **Keywire
  vault**, not by SoundLab. A service token is held in session memory, the
  provider key is fetched at runtime and never persisted, and all egress leaves
  through the Rust core (`http_request`) so no CORS or per-provider CSP entry is
  needed. See the `feat(ai)` commit.

**Pre-existing issues cleared (2026-09-17):**
- The one `tsc` error on `main` (`CompareEnginePanel.coverage.test.tsx` typed
  `snapshots` as `Record<string, unknown>[]`) is fixed — `npm run lint` is clean.
- **Clamp inconsistency normalized.** Before: BPM was 40–240 in the header,
  60–200 in the palette/controller, 40–300 in tempo detection, 30–300 on
  Recourse import, 30–300 in the store, and 20–300 on tempo points; swing was a
  0–0.66 fraction in the store and 0–75 percent on surfaces. Now every control
  surface and validator clamps through `src/lib/controlRanges.ts`
  (**BPM 60–240**, one swing fraction↔percent conversion). The persisted stores
  keep a wider tolerance on purpose (documented) so older project files and
  external payloads are not rewritten on load.
- Full verification: `npm run lint` clean; **215 test files / 2407 tests pass**.

This is a **construction plan**. Every phase is PR-sized with a self-contained
context brief so a fresh agent can execute it cold. Read `AGENTS.md` first. Two
findings from reconnaissance change the shape of the original ask and are
called out as gates below.

---

## 0. Honest feasibility gates (read before committing to anything)

These are not footnotes. Each one can invalidate a part of the plan.

### Gate A — The bundled sidecar (Decision B) may be untenable at full size

`audio-separator` (the real UVR-model interface; UVR5's own GUI has no API) is a
PyTorch application. A PyInstaller-frozen sidecar that bundles it means bundling
**torch**, plus model weights.

**Correction from measurement (2026-09-17):** the *download* footprint is much
smaller than first estimated. Resolving `audio-separator[cpu]` on win_amd64 /
cp312 yields **59 packages, 270.5 MB total download**, of which `torch 2.14.0`
is only **118.4 MB** (the CPU build on PyPI). So an earlier "400 MB – 1.5 GB
torch download" claim was wrong and is retracted.

What is still unknown and still large is the **installed and frozen** footprint,
which is what ships to users:

- Installed venv is typically 2–4x the download (unpacked DLLs, `.pyd` files,
  torch's bundled runtimes): expect **~1.5–3 GB on disk**.
- PyInstaller ONEDIR output for a torch app commonly lands **500 MB – 1.5 GB**;
  `--collect-all torch` pulls in everything and UPX frequently breaks torch DLLs.
- Model weights are *separate* and *not* counted above: MDX-Net vocals/instrumental
  ~20–60 MB each; Demucs 4-stem ~300 MB; RoFormer/MDXC ~200 MB – 1 GB each.
- The current NSIS installer is small (a static SPA + a few-MB Rust binary).

Consequences if the frozen number is large: installer goes from tens of MB to
hundreds of MB or more, GitHub release assets have practical limits, update UX
degrades, and antivirus false positives on PyInstaller output are common.

**Sub-options to choose between:**

- **B1 — Frozen `audio-separator` (torch).** Maximum model coverage (MDX, VR
  Arch, Demucs, MDXC/RoFormer). Upstream maintains the inference plumbing.
  Largest artifact.
- **B2 — Thin ONNX-only runner.** Ship `onnxruntime` (not torch) + a small
  runner using MDX-Net `.onnx` weights. Roughly an order of magnitude smaller
  download (onnxruntime 13.6 MB + numpy 12 MB vs 270 MB). No Demucs/RoFormer.
  This is *not* a new model — same UVR-trained MDX weights — but it **is**
  custom inference plumbing (STFT, segmentation, overlap-add) that you own and
  must keep in parity with UVR preprocessing.
- **B3 — Do not bundle at all; optional "Separation Pack" download.** Ship the
  base app small and fetch a runtime pack (a B1 or B2 frozen exe) plus weights
  on first use, with consent and checksum verification. **This also removes the
  `externalBin` CI problem (Gate B) entirely**, because nothing is bundled.

Weights should **not** be bundled under any option: download on first use into
an app-data model dir, with explicit consent and hash verification.

**Decision is deferred to Phase 0 measurement — the frozen size and the
bundle-vs-download choice cannot be settled from download sizes alone.**

### Gate B — `externalBin` breaks the existing Linux CI job unless handled

`src-tauri/build.rs` runs `tauri_build::build()`, which (in the locked
`tauri-build 2.6.3`) validates `bundle.externalBin` **at build-script time**.
The `backend` CI job (`ci.yml`, `cargo test --all-targets`) compiles on
**ubuntu**, and `npm run build` runs first there. Adding
`"externalBin": ["binaries/uvr-separate"]` therefore requires:

- `src-tauri/binaries/uvr-separate-x86_64-pc-windows-msvc.exe` (local + release)
- `src-tauri/binaries/uvr-separate-x86_64-unknown-linux-gnu` (ubuntu CI)

`tauri.conf.json` has no native per-key platform conditional. Options:

1. Commit a Linux artifact/stub (simplest, but PyInstaller cross-builds are not
   trivial — a Linux CI runner must produce it).
2. Provide per-platform Tauri configs merged via the `TAURI_CONFIG` env var or
   the `--config` flag (`tauri build --config src-tauri/tauri.windows.conf.json`).
3. Move the `externalBin` reference out of the committed config and inject it
   only in the release workflow.

**Decide this before editing `tauri.conf.json`.** It is the single most likely
way this phase red-lines CI.

### Gate C — Model licensing is not "MIT, therefore free to ship in a paid app"

The `audio-separator` *wrapper* is MIT. The **models** are separately licensed:
UVR's README explicitly requires crediting UVR and @Anjok07, and some
RoFormer/MDXC weights carry non-commercial terms. For a **$5 one-time paid
product**, every model exposed in the picker must be audited for redistribution
and commercial use. Ship a model registry with a `license` field and default the
picker to weights cleared for commercial use.

### Gate D — "Undoable AI actions" is not currently true for half the store surface

`HistorySnapshot` (`src/store/historyStore.ts:23-39`) captures only `layers`,
`patterns`, `programs`, `activePatternId`, `songChain`, `activeBank`,
`masterLevel`, `masterRack`, `bpm`, `timeSignature`. It does **not** capture
`patternStore.arrangement`, `mixerStore` (buses + sends), `masterDynamicsStore`,
`referenceTrackStore`, or `controllerStore`. An LLM action that changes a bus
send or a master-dynamics setting would be **silently non-undoable**. Phase 2
below fixes this *before* the NL layer is allowed to touch those stores.

---

## 1. Target architecture (what the four integrations share)

```
                         +---------------------------+
                         |  Action Registry (typed)  |   <-- new: schema, not just closures
                         |  id + params + ranges     |
                         +------------+--------------+
                                      |
        +-----------------+-----------+-----------+------------------+
        |                 |                       |                  |
   Command Palette   NL Command Layer        MIDI controller    Ops/Session Hub
   (existing UI)     (LLM -> validated       (existing ACTION_DEFS) (new)
                      action list -> confirm)
        |                 |                       |                  |
        +-----------------+-----------+-----------+------------------+
                                      |
                         +------------v--------------+
                         |  Stores + historyStore    |   <-- extended snapshot coverage
                         +---------------------------+
                                      |
                    +-----------------+------------------+
                    |                                    |
             AI Provider Layer                    UVR Sidecar (Tauri)
             (LLM: cloud + local)                 (stem separation, desktop-only)
                    |
             Grounding features
             (Meyda / analysis already in repo)
```

Shared foundation = the **typed action registry** + **extended undo snapshots**.
Both the NL layer and the palette consume the registry; the sidecar and the ops
hub consume the stores.

---

## 2. Phase 0 — Feasibility spike and go/no-go (gate; no product code)

**Purpose:** produce measured numbers and a decision, not shipped code. Phase 0
output is a short results memo (append it to this file or a sibling
`plans/phase-0-uvr-results.md`) plus a record of the chosen option.

**Time budget:** 1–2 working days of machine time. The PyInstaller freeze alone
can consume 2–4 hours of build time; the dependency download is ~270 MB.

**Kill criteria (any one stops the bundled-sidecar plan):** frozen ONEDIR
> 1 GB; or a 3-minute track taking > 15 minutes on the defined minimum target
hardware; or the useful models turning out to be non-commercial (Gate C); or no
producible Linux artifact combined with a refusal to adopt B3.

---

### Step 0.0 — Preconditions and the spike-machine reality (MEASURED)

The machine available for the spike is **not** the target machine. Numbers from
it are a **worst realistic case** (CPU-only, no CUDA), which is exactly the case
for the majority of users who lack an NVIDIA GPU — so it is worth measuring, but
it must be labelled and it must not be the only measurement.

Spike machine (measured 2026-09-17):

| Property | Value |
|---|---|
| CPU | Intel Core i7-10610U @ 1.80 GHz, 4 cores / 8 threads (low-power ultrabook, 2020) |
| RAM | 15.7 GB total, **4.2 GB free** |
| GPU | Intel UHD Graphics (integrated). **No NVIDIA / no CUDA.** |
| Disk free | C: **25.4 GB**, E: 13.4 GB |
| Python | 3.12.10 (`C:\Program Files\Python312`) |
| Tooling | `uv 0.9.30` (preferred), `pip 26.2.1`; no pipx, no pyinstaller |

Consequences for the spike:

1. **The CUDA path cannot be measured here.** Any timing is CPU-only. Record it
   as such and state clearly that GPU numbers are unmeasured.
2. **RAM is a real risk.** 4.2 GB free is close to the expected peak for a
   torch separation. A failure here is a finding, not a bug: it predicts
   low-end-user failure. Record peak RAM even when the run OOMs.
3. **Disk is tight.** Put the venv and PyInstaller build/work dir on **E: or the
   system temp**, never on C:. Budget ~6 GB.
4. **A second measurement on target hardware is mandatory** before any go
   decision (see Step 0.7).

**Define the minimum target spec now** (used by the thresholds in Step 0.8):
CPU-only, reasonably modern: 4+ cores, 8 GB RAM, 5 GB free disk, no GPU.
Recommended: 8+ cores, 16 GB RAM, NVIDIA GPU with CUDA.

---

### Step 0.1 — Dependency footprint (DONE — measured 2026-09-17)

Command used (resolves without installing):

```powershell
python -m pip install --dry-run --report "$env:TEMP\as-report.json" --ignore-installed "audio-separator[cpu]"
```

Result: **59 packages, 270.5 MB total download.** Largest items:

| Package | Version | Download MB |
|---|---|---|
| torch | 2.14.0 | 118.4 |
| llvmlite | 0.49.0 | 39.9 |
| scipy | 1.18.1 | 35.0 |
| onnxruntime | 1.30.0 | 13.6 |
| numpy | 2.5.3 | 12.0 |
| scikit-learn | 1.9.1 | 7.9 |
| onnx-weekly | 1.24.0.dev20260914 | 7.5 |
| pillow | 12.3.0 | 6.9 |
| sympy | 1.14.0 | 6.0 |
| (51 others) | | ~24 |

**Stability finding (must be fixed before shipping):** `audio-separator` pulls
`onnx-weekly` (a **dev-tagged** weekly build), `onnx2torch-py313` (a fork), and
`diffq-fixed`. For a paid product, **pin every version and vendor the resolved
lock**, and re-audit on each bump. A weekly-dev transitive dependency is an
unacceptable supply-chain default.

**Still to measure (Step 0.2/0.3):** installed size, frozen size, runtime.

---

### Step 0.2 — Spike B1: frozen `audio-separator` (torch)

Work in a throwaway dir outside the repo, e.g. `E:\spike-uvr\`.

```powershell
cd E:\spike-uvr
uv venv --python 3.12 .venv
& .venv\Scripts\python.exe -m pip install "audio-separator[cpu]" pyinstaller
"{0:N0} MB installed" -f ((Get-ChildItem -Recurse -File .venv | Measure-Object Length -Sum).Sum/1MB)
```

**Run one real separation** on the reference track (Step 0.6) and record
wall-clock + peak RAM:

```powershell
$exe = ".venv\Scripts\audio-separator.exe"
$args = @("ref.wav","--model_filename","UVR-MDX-NET-Inst_HQ_3.onnx",
          "--output_format","WAV","--output_dir","out",
          "--model_file_dir","models","--single_stem","Instrumental")
$sw=[Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath $exe -ArgumentList $args -PassThru -NoNewWindow `
     -RedirectStandardOutput "out.log" -RedirectStandardError "err.log"
$peak=0
while (-not $p.HasExited) {
  Start-Sleep -Milliseconds 500
  try { $p.Refresh(); if ($p.PeakWorkingSet64 -gt $peak) { $peak=$p.PeakWorkingSet64 } } catch {}
}
$sw.Stop()
"elapsedSec: {0:N1}" -f $sw.Elapsed.TotalSeconds
"peakRAM_MB: {0:N0}" -f ($peak/1MB)
"exitCode: $($p.ExitCode)"
```

**Then freeze it** (budget hours; torch + PyInstaller is known-fiddly):

```powershell
pyinstaller --noconfirm --onedir --name uvr-separate `
  --collect-all audio_separator --collect-all torch --collect-all librosa `
  --collect-all soundfile --collect-all resampy --collect-all julius `
  --collect-all onnx2torch --collect-all rotary_embedding_torch `
  --hidden-import onnxruntime entry.py
"{0:N0} MB frozen" -f ((Get-ChildItem -Recurse -File dist\uvr-separate | Measure-Object Length -Sum).Sum/1MB)
```

`entry.py` is the eventual sidecar entry: a thin wrapper that calls
`audio_separator.separator.Separator` and prints one JSON progress line per
stage (so Rust can parse it and emit `separate://progress`). It is a caller, not
a reimplementation.

**Record:** installed MB, frozen ONEDIR MB, cold-start seconds, elapsed seconds
for a 3-minute track, peak RAM, and any AV/SmartScreen interaction.

---

### Step 0.3 — Spike B2: thin ONNX-only runner

Purpose: quantify the smaller alternative so the B1/B2 choice is data-driven.

```powershell
cd E:\spike-uvr
uv venv --python 3.12 .venv-onnx
& .venv-onnx\Scripts\python.exe -m pip install onnxruntime numpy soundfile pyinstaller
```

Scope of the runner (custom code you would own):

- Load an MDX-Net `.onnx` model with `onnxruntime.InferenceSession` (CPU EP).
- Reproduce UVR/MDX preprocessing: STFT with the model's expected n_fft/hop,
  chunked segments with overlap, magnitude/phase handling, inverse STFT,
  overlap-add, and stem reconstruction.
- Write WAV with `soundfile`.

**Record the same metrics as 0.2**, plus an honest **effort estimate** for
bringing this to parity with `audio-separator` (segmentation/overlap settings,
resampling, normalization). If the effort estimate exceeds the artifact-size
saving is worth, say so and prefer B1.

**Note (honesty):** B2 is the option closest to "building your own separation,"
which the original request wanted to avoid. It reuses UVR weights but not UVR
plumbing. Treat it as a fallback, chosen only if B1's frozen size is
disqualifying.

---

### Step 0.4 — Distribution-format spike

Measure the *delta a user downloads*, not the venv.

- ONEDIR vs `--onefile`: onefile is a single exe but self-extracts to temp on
  every launch (slower cold start, more AV noise). Measure both.
- NSIS installer delta: run `npm run tauri:build` with the frozen exe in
  `src-tauri/binaries/` and `externalBin` set; measure the produced
  `*-setup.exe` size vs the current build.
- UPX: test `--upx-dir`; if torch DLLs fail to load, record and disable.
- **Antivirus / SmartScreen:** run the frozen exe on a clean-ish profile; note
  Defender/SmartScreen warnings. This determines whether code signing is
  required before shipping.

---

### Step 0.5 — Linux / CI producibility (Gate B)

Determine how the `backend` CI job (`cargo test` on ubuntu) will pass:

- Attempt a PyInstaller build for `x86_64-unknown-linux-gnu` (native Linux or a
  Linux CI runner — cross-building PyInstaller from Windows is not realistic).
- If a Linux artifact is not worth maintaining, choose **B3** (no bundling, so
  no `externalBin`, so Gate B disappears) or platform-gate the config via
  `TAURI_CONFIG` / `tauri build --config` and inject `externalBin` only in
  `release.yml`.
- Record the chosen approach in Phase 1 Step 1.2 before editing
  `tauri.conf.json`.

---

### Step 0.6 — Reference audio (repeatability)

Timing is only comparable if the input is fixed. Use:

- **Primary:** one real, clearly licensed 3:00 stereo 44.1 kHz track (a
  Creative Commons release with a percussive + tonal + vocal mix — separation
  speed depends on content, so a synthetic test understates it).
- **Checksum it** and store it outside the repo; record the hash and source in
  the results memo so the measurement is reproducible.
- **Fallback (offline):** a generated 3:00 mix at 44.1 kHz; label any result
  from it as a synthetic lower bound.

---

### Step 0.7 — Second measurement on target hardware

The spike box is below the minimum spec. Before any go decision, repeat
Step 0.2 on a machine matching the recommended spec (8+ cores, 16 GB, NVIDIA
GPU) and record both CPU and CUDA timings. If no such machine is available, the
decision must explicitly acknowledge that GPU and mid-range performance are
**unmeasured**, and the feature should ship as opt-in with a clear warning.

---

### Step 0.8 — Decision matrix (thresholds)

Fill measured values in and apply:

| Metric | Green (bundle B1) | Amber (prefer B3 download) | Red (B2 or no-ship) |
|---|---|---|---|
| Frozen ONEDIR size | < 250 MB | 250–600 MB | > 600 MB |
| Installer size delta | < 300 MB | 300–700 MB | > 700 MB |
| 3-min separation, minimum target (CPU) | < 3 min | 3–8 min | > 8 min |
| Peak RAM | < 2 GB | 2–3.5 GB | > 3.5 GB |
| Cold start | < 5 s | 5–15 s | > 15 s |
| AV / SmartScreen | clean | warning only | blocked |

Decision rules:

- **All Green** → bundle B1 via `externalBin` (accept Gate B work).
- **Any Amber** → **B3**: ship the runtime as an optional download pack; base
  installer stays small; Gate B is avoided.
- **Any Red on size/RAM** → evaluate B2; if B2's effort/parity cost is
  unacceptable, do not ship separation and say so.
- **Red on timing only** → still viable as a background/batch job with real
  progress and cancel, but only with an explicit, visible expectation of
  minutes-per-track. Never hide it behind a spinner.

---

### Step 0.9 — Licensing audit (Gate C, no machine required)

Enumerate candidate models and record, per model: architecture, output stems,
SDR where published, weights size, **license**, **commercial-use permitted?**,
**credit required?**. Default the picker to commercially cleared weights only.
This step can run in parallel with 0.2–0.4.

---

### Step 0.10 — Deliverable

A short results memo containing: the filled decision matrix, both spike
artifacts' sizes, measured timings and peak RAM with the machine spec labelled,
the Linux/CI decision, the licensing outcome, and a single recommended option
(B1 bundled / B2 ONNX / B3 download / no-ship) with its rationale. Only then
does Phase 1 begin.

---

## 3. Phase 1 — UVR stem separation (desktop-only)

### Step 1.1 — Rust `separate` module + sidecar wiring

**Files:**

- `src-tauri/src/separate/mod.rs` (new) — mirror `src-tauri/src/aaf/mod.rs`
  (`pub mod commands;`, optionally `runner.rs`, `types.rs`).
- `src-tauri/src/separate/commands.rs` (new) — `#[tauri::command] async fn`,
  returning `Result<T, String>` (matches `aaf/commands.rs` convention).
- `src-tauri/src/lib.rs` — add `pub mod separate;` (near L1),
  `.plugin(tauri_plugin_shell::init())` (near L16), and the new commands inside
  `generate_handler!` (L17-20). A command not registered here is rejected at
  runtime.
- `src-tauri/Cargo.toml` — add `tauri-plugin-shell = "2"` under `[dependencies]`
  (L20-30). `Cargo.lock` is committed and will change.
- `src-tauri/capabilities/default.json` — add a **scoped** shell permission
  (L8-11). `shell:default` is insufficient (it only allows `open`); we need
  `shell:allow-execute` / `shell:allow-spawn` with
  `{ "name": "binaries/uvr-separate", "sidecar": true, "args": true }`. An
  unknown permission identifier fails the build.
- `src-tauri/tauri.conf.json` — add `bundle.externalBin` after L31. **No CSP
  change** if we return audio over IPC (see 1.3); asset-protocol playback would
  require `assetProtocol` scope + CSP additions and is explicitly avoided.

**Commands (proposed):**

- `separate_probe() -> { available, version, models: ModelInfo[], device }` —
  runs the sidecar's `--list_models --list_format json` (B1) or a runner
  `--list-models` (B2). **Never hardcode the model list.**
- `separate_start(payload) -> { jobId }` then `separate://progress` events.
- `separate_cancel(jobId)`.
- `separate_read_stem(jobId, stemName) -> { name, sampleRate, channels, frames, wavBase64 }`.

**Security:** spawn with an argument array (`Command`/sidecar `.args([...])`),
never a shell string. Validate/whitelist `model_filename` against the probed
list before spawning. Validate `output_dir` is inside the job temp dir.

### Step 1.2 — Sidecar binary + build pipeline

**Files:**

- `src-tauri/binaries/uvr-separate-<target-triple>[.exe]` — produced by the
  spike. `binaries/` is **not** gitignored today; if the artifact exceeds a
  sane repo size, add a download step instead of committing.
- `.github/workflows/release.yml` — add a build step that produces the frozen
  sidecar for the Windows target before `tauri-apps/tauri-action` runs (it reads
  `externalBin`). This workflow is `windows-latest`.
- `.github/workflows/ci.yml` — resolve Gate B: provide the Linux-suffixed
  artifact or inject `externalBin` only for the release build.
- `.gitignore` — decide explicitly; do not let a multi-hundred-MB binary slip in
  silently.

### Step 1.3 — Data path (size-aware)

**The naive path is wrong.** Everything in this repo currently moves audio as
base64 JSON over `invoke` (`aaf/commands.rs:38-40`, `:79`). A 3-minute stereo
24-bit/48 kHz source is ~52 MB raw → **~69 MB base64** in one JSON frame; four
to six stems multiplies that. Do not inline full stems.

**Recommended path:**

1. **Render source in JS.** `audioEngine.exportWav([sourceLayer], dur)`
   (`src/lib/audioEngine.ts:1479`, 44.1 kHz stereo, includes master rack + limiter)
   or `audioEngine.exportLayerStem(layer, dur, 48000)` (`:1596`, pre-master).
   **Do not rely on the global `bypassFX` flag** (`audioEngine.ts:87`, `:420`) —
   it is mutable instance state that A/B toggling flips (`App.tsx:447`), so a
   render's wet/dry status would be non-deterministic. If a dry render is
   required, add an explicit argument.
2. **Encode + hand off.** `audioBufferToWav(buffer, 16)` (`src/lib/audioUtils.ts:48`,
   returns a `Blob`) → `Uint8Array` → one Rust command writes a temp input WAV
   (`std::fs::write`, pattern at `aaf/commands.rs:52`). For large inputs, prefer
   a raw `tauri::ipc::Response` byte channel over base64 to avoid 33% inflation.
3. **Spawn the sidecar** via `tauri-plugin-shell` with the temp input path, a
   model filename, and a per-job output dir under app-data (also the
   `--model_file_dir` for weight downloads). The process writes stem WAVs.
4. **Progress** via Tauri `emit`/`listen` (`separate://progress`) — `invoke` is
   request/response and cannot report progress. A parsed stderr/JSON-lines feed
   drives a real bar; **do not fake progress**.
5. **Return per-stem WAV bytes** (base64 per stem, or raw response), fetched one
   stem at a time so no single frame is huge. JS decodes with
   `decodeAudioData` — no Rust WAV parser needed.
6. **Create layers / save samples.** Reuse `pcmToAudioBuffer`
   (`src/components/AafExportPanel.tsx:44`) or decode the WAV directly, then
   `addLayer('sample', buffer, name)` (`App.tsx:954`) or `saveLibrarySample`
   (`src/lib/sampleLibrary.ts:207`).

**Note:** `addLayer` auto-auditions (`App.tsx:978-981`). Adding six stems will
play the last one over the mix. Use the batch pattern that builds `SoundLayer`
objects without auto-play (`App.tsx:1006-1020`, `:1165-1188`).

### Step 1.4 — UI: `StemSeparationPanel.tsx`

**Files:** `src/components/StemSeparationPanel.tsx` (new, named export),
`src/components/StemSeparationPanel.test.tsx` (new; subject to the 90% new-code
coverage gate, 80% floor for new files).

**Conventions to copy from `AafExportPanel.tsx`:**

- `isTauri()` gate (`:40-41`) — or import `isDesktopBuild` from
  `src/lib/demoGate.ts:19-22` instead of duplicating. Web must render a
  "desktop app only" badge and **never call IPC** (the web CSPs in `vercel.json`,
  `.headers`, `nginx.conf` have no `ipc:`).
- `invoke` from `@tauri-apps/api/core`, `open`/`save` from
  `@tauri-apps/plugin-dialog`.
- Payload key is `payload` for struct args (`AafExportPanel.tsx:134-139`).

**Mount point:** lazy-import beside `App.tsx:76`; if modal-style, add a boolean
beside `App.tsx:273-277`, mount inside the Suspense block (`:2658-2702`), and
register it in `otherModalOpen`/`isAnyModalOpen` (`:736-742`), the Escape chain
(`:752-760`), and the keyboard-effect dependency array (`:842`). If inline, mount
inside a stage panel (e.g. `produce`, `:2583-2615`) with an absolutely-positioned
wrapper like `AafExportPanel` (`:2604`). Pass
`onAddLayer={(buffer, name) => addLayer('sample', buffer, name)}` following the
`StudioSequencer` wiring at `App.tsx:2597-2600`.

**Long-running UX:** support cancel, show device actually used (CPU vs CUDA),
and show a clear first-run "downloading model" state. State the offline caveat:
first use requires network for weights.

---

## 4. Phase 2 — Foundation: typed action registry + undo coverage

This phase gates the NL layer. It is mostly refactor and has no user-visible
feature, which is why it is separable and testable.

### Step 2.1 — Typed action registry

*Context:* `Command` (`src/lib/commands.ts:12-21`) is
`{ id, label, group, keywords?, run: () => void }` — a closure list, not
machine-readable. The **best existing model** is the MIDI controller catalog:
`ACTION_DEFS` (`src/lib/controller/actions.ts:171-304`, ~100 string-keyed ids)
and `dispatchAction(action, ctx)` (`:439`), wired through
`studioControllerHandlers.ts` and `ControllerHost.tsx:buildHostDeps`.

**Deliverable:** extend that vocabulary rather than build a parallel one.

- Add per-action metadata: `id`, `group`, `params: ParamSpec[]`
  (`{ name, type: 'number'|'enum'|'bool'|'string', min?, max?, options?, unit? }`),
  `mutatesAudio: boolean`, `undoable: boolean`, `appliesTo?: 'layer'|'pattern'|...`.
- Keep a single source of truth: the palette, the NL tool schema, and the MIDI
  dispatcher all derive from it.
- Add the missing high-value actions discovered in reconnaissance:
  `toggleCell` (no `toggleCell` exists), `setVelocity` (velocity is only
  writable via `setCell`/`setRow`), `setSwing`, `setStepLength`, `setBus`,
  `setLayerSend`, `setMasterDynamics`, `addModule`/`updateModule`,
  `setLayerGain/Pan/Mute/Solo`.
- **Normalize clamps** or the NL layer will drift: BPM is `30..300` in
  `patternStore.ts:186` but `60..200` in `appCommands.ts:51-53` and
  `studioControllerHandlers.ts:182`. Swing is `0..0.66` fraction in the store vs
  `0..75` percent in the controller. Pick one canonical unit/range per param and
  convert at the UI boundary.

**Files:** `src/lib/controller/actions.ts` (extend), `src/lib/commands.ts`
(keep `run` for the palette, add spec alongside), `src/lib/appCommands.ts`
(derive), plus co-located tests (`appCommands.test.ts`, `commands.test.ts`).

### Step 2.2 — Extend undo coverage (Gate D)

**Files:** `src/store/historyStore.ts`, `src/App.tsx`.

- Add to `HistorySnapshot` (`historyStore.ts:23-39`): `arrangement`,
  `mixer` (buses + layerSends), `masterDynamics` (settings + sidechains).
- **Critical:** also add each new field to `snapshotsEqual` (`:172-184`). If a
  field is not compared there, `App.tsx:237` treats the state as unchanged and
  **no undo entry is ever created** — a silent failure.
- Extend the snapshot build + the commit effect dependency array
  (`App.tsx:213-239`), and the applier `applyHistorySnapshot` (`:186-200`).
- Wire `beginTransaction`/`endTransaction` (`historyStore.ts:93-105`) into the NL
  executor so a multi-step phrase coalesces into **one** undo step. These are
  currently used only in tests.

**Verify:** a single NL command that touches pattern + mixer + master dynamics
undoes as one step; toggling a bus send creates exactly one history entry.

---

## 5. Phase 3 — AI provider layer + NL command surface

### Step 3.1 — Provider abstraction (local + cloud)

**Files (new):**

- `src/lib/ai/provider.ts` — `LlmProvider` interface
  (`complete(messages, opts): Promise<{ text; usage? }>`), plus a `null`
  provider that no-ops when unconfigured.
- `src/lib/ai/openaiCompatible.ts` — OpenAI / OpenRouter / Groq / any
  OpenAI-compatible base URL (covers local `llama.cpp` server).
- `src/lib/ai/ollama.ts` — fully local (`http://localhost:11434`).
- `src/store/aiProviderStore.ts` — non-secret config (provider id, base URL,
  model, enabled, temperature). Persistence template: `controllerStore.ts`
  (versioned localStorage key `:30`, `:37`, subscribe `:296`, defensive
  rehydrate `:100-129`).
- `src/lib/ai/keychain.ts` — secret handling. **Do not persist API keys to
  IndexedDB/localStorage in plaintext.** On desktop, add a Rust command
  (`ai_secret_set` / `ai_secret_get` / `ai_secret_clear`) backed by the OS
  keychain; on web, keep the key in session memory only and warn the user
  explicitly. Never write keys into `ProjectDocument`/`.nsl` (exported as
  plaintext, `projectFileIO.ts:74-107`) or commit them.

**Graceful degradation:** with no provider configured, the app is byte-identical
in behavior — NL UI hidden/disabled, no network calls.

**Metering:** `trackEvent` (`src/lib/analytics.ts:32`) is the only telemetry
sink and has no cost/token accounting. Add a small usage event (provider, model,
prompt/completion tokens, ms) so cloud spend is visible.

### Step 3.2 — NL interpretation (structured output)

**Files:** `src/lib/ai/interpret.ts` (new) + `src/lib/ai/interpret.test.ts`.

- Build a JSON schema **from the action registry** (Step 2.1) and ask the model
  for `{ actions: [{ id, params }], rationale }`.
- **Validate every returned id against the registry; reject unknown ids and
  out-of-range params.** This is the anti-hallucination property: the model can
  only emit actions that exist and can only pass values that validate.
- Do not blind-execute. Return a **preview** (readable action list) that the user
  confirms; then run inside `beginTransaction`/`endTransaction` (Step 2.2) so it
  is one undo step.
- Small local models are weak at strict JSON tool-calling. Expect to validate and
  repair; keep the grammar tight. Cloud models perform better — the provider
  abstraction lets the user choose.

### Step 3.3 — UI

**Files:** `src/components/AiCommandPanel.tsx` (new) + test, or an "Ask AI" mode
inside the existing `CommandPalette.tsx` (props `:17-23`).

- If a new modal: register in `App.tsx` `otherModalOpen` (`:736-742`), Escape
  chain (`:752-760`), keyboard dep array (`:842`), and mount in the Suspense
  block (`:2658-2702`).
- Header trigger button modeled on the shortcuts/manual buttons
  (`App.tsx:1866-1882`).
- Extend `CommandGroup` with `'AI'` and `COMMAND_GROUP_ORDER` if the palette
  hosts it (`commands.ts:23-38`).
- Preview + confirm + "what will change" list before execution. Show the
  resolved actions, not chat prose.

---

## 6. Phase 4 — Grounded auto-name / auto-tag

*Context:* the repo already has real, deterministic feature extraction, so
grounding is more present than expected and the LLM must only *phrase measured
values*, never invent them.

- `analyzeAudioBuffer` (`src/lib/batchAudioProcessor.ts:30`) already returns
  peak/rms/transient/centroid/`estimatedKey`/`suggestedCategory`; the persisted
  shape is `StoredSampleAnalysis` (`db.ts:51-60`). `analyzeLibrarySample`
  (`sampleLibrary.ts:49`) and `suggestCategory` (`:108`) exist. A deterministic
  auto-namer already exists at `FolderUploadModal.tsx:158-190`.
- **New:** `src/lib/ai/enrich.ts` — input = measured `AudioAnalysisResult`;
  build a prompt containing **only those numbers**; require output
  `{ name, tags[] }`; **validate that the model introduced no fact absent from
  the payload** (drop the field if it did).
- **Hook points:** `SampleBrowser.importFiles` immediately after
  `saveLibrarySample` resolves (`SampleBrowser.tsx:368-376`) and the
  `scanDeps.saveSample` wrapper (`:417-434`). Fire-and-forget, swallow errors
  internally so a failed enrichment never rejects an import. **Do not await
  enrichment inside `saveSample`** — `scanDirectoryToLibrary` awaits it
  (`folderLink.ts:97`), so awaiting would stall the whole scan.
- **Persist** via `updateLibrarySample(id, { name, tags, category })`
  (`sampleLibrary.ts:265`) — non-audio fields only, never re-encode audio. Then
  call `refresh()` (`SampleBrowser.tsx:149-165`) honoring the request-token guard.
- **Storage:** `StoredSampleLibrarySample` (`db.ts:27-48`) is schemaless for
  non-indexed fields, so adding optional `sourceType?: 'stem' | 'import'` and
  `separationJobId?: string` needs no version bump. Add an index only if you must
  query by job.
- **Transparency (anti-theater):** show the measured features next to the model's
  phrasing in the UI so the grounding is visible and checkable.

---

## 7. Phase 5 — Ops / session hub

*Context:* a hub is only real if it tracks real artifacts. Build the status board
around things that already exist (project documents, rendered stems, exports).

### Step 5.1 — Persistence

- New Dexie table. **Name it `opsSessions`, not `sessions`** — `sessions` is
  already overloaded (`ratingSessions` in `ncs-rating-db`, `RatingSession`,
  and the documented "chop sessions" = `chopMaps`).
- `src/lib/db.ts` — add the table property near `:196` and a new
  `this.version(7).stores({ opsSessions: 'id, status, updatedAt, createdAt' })`
  after `:231`. Dexie merges prior versions forward; existing data is untouched.
- Row shape: `{ id, title, status, client?, dueDate?, deliveredAt?, sourceProjectId?, stemJobIds[], createdAt, updatedAt }`.
- Template: `src/lib/chopMaps.ts` — the closest existing analogue (source audio
  + metadata + status/timestamps, upsert-with-id-preservation). `src/lib/opsSessions.ts`
  (new) mirrors its CRUD signatures.
- **Do not** add ops data to `ProjectDocument` — it would leak into exported
  `.nsl` files.

### Step 5.2 — Store + UI

**Files:** `src/store/opsStore.ts` (new), `src/components/SessionHubPanel.tsx`
(new) + test.

- Gate the new screen correctly. A new workspace screen must be added as a
  `TabType` member (`workflowStages.ts:19-28`), a `TAB_LABELS` entry (`:51-61`),
  and to a stage's `tabs`/`defaultTab` (`:63-134`) — otherwise the hash router
  (`resolveHashTarget` `:153-160`), sidebar (`App.tsx:1493-1560`), sub-tab strip
  (`:1921-1945`), and palette nav commands (`appCommands.ts:59-78`) cannot reach
  it. Adding a `TabType` **without** a matching `activeTab ===` render block in
  `App.tsx` (`:1998-2615`) leaves a blank workspace.
- Status changes are manual and tied to a real artifact (a saved project, a
  rendered stem job). No synthesized metrics, no fake analytics.
- `sourceProjectId` links to `projectDocuments` (`db.ts:373-404`); `stemJobIds`
  link to Phase 1 separation jobs.

---

## 8. Phase 6 — Optional Recourse integration (music + self-learning)

**Principle: optional and off by default.** With the toggle off the app makes
**zero** network calls and behaves exactly as today. No module-level `fetch`;
every call sits behind an explicit setting. This preserves the local-first /
offline guarantee and keeps Recourse's weight out of the shipped product.

Recourse is the local service at `C:\Users\User\Downloads\recourse`
(Express on port 3050, matching `DEFAULT_RECOURSE_BASE`). SoundLab already
consumes it one-way and read-only (`recourseEvolution.ts`, `recourseSong.ts`,
`recourseBridge.ts`, `RecourseComposerPanel.tsx`).

### 6.0 Honest scope — what Recourse does and does not provide

**Provides.** Musical (all `GET`, CORS-open): `/compose/soundlab.json` (piece),
`/compose/song.json` (chords/key/bpm), `/compose/styles`, `/compose/track.json`
(full `events[]` with `part`/`drum`/`velocity` + `sections`), `/compose/wav`,
`/compose/stems`, `/compose/midi`, `/compose/suggest`, `/compose/learned`,
`/compose/benchmark`. Learning (all `GET`, open): `/compose/learned`
(adjustments + episodes + leaderboard), `/learn/status`, `/learn/directives`,
`/memory/tiered`, `/memory/recall?q=`, `/decision/evaluate`. Submit:
`POST /compose/rate` (absolute 1–5 per style/seed/bars), `POST /learn/episode`
(scalar `externalScore`).

**Does not provide.**
- No documented prompt→completion endpoint. `POST /api/ollama/chat`
  (`server.ts:3323-3349`) is outside `/api/recourse`, not in OpenAPI, ungated,
  and sends no CORS header. The AI-gateway role needs a new endpoint (or a
  Rust-side call).
- **No source separation.** `/compose/stems` renders stems of Recourse's *own
  generated* track (`compose.ts:285-301`), not separation of arbitrary audio.
  Stems stay deferred.
- **No pairwise rating.** Recourse's learner takes an **absolute 1–5**; SoundLab's
  loop is **pairwise Elo**. They are not equivalent — see 6.4.

### 6.1 Blockers in Recourse that must be fixed first

**C1 — No CORS on the write path (hard blocker).** There is no `cors` package and
no global middleware; the only CORS headers are per-route
`Access-Control-Allow-Origin: *` on six GETs (`compose.ts:177,229,274,299,312,326`).
There is **no** `Access-Control-Allow-Methods`, **no** `Access-Control-Allow-Headers`,
and **no** `OPTIONS` preflight handler anywhere. Any cross-origin POST from the
Tauri webview or the Vercel origin to `/compose/rate` (or a learning route) will
**fail preflight**. `GET /compose/styles` (`compose.ts:130-132`) also lacks `ACAO`
today.

**C2 — Ungated mutating routes.** `POST /learn/episode`, `/learn/run`,
`/learn/replay`, `/learn/synthesize-directive`, `/memory/index`, `/skills/rescan`,
`/decision/weights`, `/decision/execute`, and `/api/ollama/chat` call no guard,
while their `/v1` serverless mirrors are gated. Gate them before SoundLab
depends on the server.

**C3 — Bind address.** `app.listen(PORT, '0.0.0.0', …)` (`server.ts:9708`) exposes
the API on all interfaces. Bind `127.0.0.1` for a local-only integration.

**C4 — Secret distribution.** `POST /compose/rate` requires
`RECOURSE_API_SECRET` (`mutationAuth.ts:46-60`, fail-closed: 503 if unset, 401 if
wrong; accepted via `Authorization: Bearer` or `x-api-secret`). SoundLab needs a
place to hold it — see 6.2.

### 6.2 SoundLab plumbing

- **New `src/store/integrationStore.ts`** — persisted + versioned (mirror
  `controllerStore.ts:30,37,296`): `{ recourse: { enabled, baseUrl, submitRatings } }`,
  default `enabled: false`.
- **Replace the duplicated URL state.** `EvolutionPanel.tsx:76` and
  `RecourseComposerPanel.tsx:40` each keep a private, unpersisted
  `useState(DEFAULT_RECOURSE_BASE)`. Both read the store instead. The URL
  builders (`recourseEvolution.ts:26`, `recourseSong.ts:56,85`) already take
  `base` as a parameter — no signature change.
- **Timeout every fetch.** `fetchRecourseSong` (`recourseSong.ts:76-82`) and
  `fetchRecoursePiece` (`recourseEvolution.ts:33-39`) have **no timeout** — a
  hung server hangs the UI (`isGenerating` never clears). `fetchRecourseStyles`
  (`recourseSong.ts:85-98`) is the only call that degrades gracefully; make the
  rest match with `AbortController` + a bounded timeout.
- **CSP.** Add `http://localhost:3050 http://127.0.0.1:3050` to `connect-src` in
  `src-tauri/tauri.conf.json:26`, `vercel.json:18`, `.headers:7`, `nginx.conf:10`.
  (Static CSP cannot be toggled at runtime; a localhost-only origin is low risk.)
  This is the #6 fix reduced to one origin.
- **Secret storage.** Reuse the #7 decision: OS keychain on desktop, session
  memory on web. Never IndexedDB/localStorage plaintext, never in `.nsl`.
- **UI gating.** A small settings panel: enable toggle, base URL, "test
  connection" (`GET /compose/styles`), status pill. Disabled ⇒ all Recourse UI
  hidden and no calls made.

### 6.3 Musical abilities to wire (beyond the existing piece/song/styles)

- `GET /compose/suggest?style=&count=` → a "Suggest brief" button that fills
  style/key/bars/seed from the learner's recommendation.
- `GET /compose/learned` → surface adjustments + leaderboard; optionally default
  the composer to the top-ranked style.
- `GET /compose/track.json` → richer import than `recourse-soundlab-piece`: full
  `events[]` with `part`/`drum`/`velocity`, `sections`, `mode`.
- `GET /compose/midi` → MIDI import/export alongside the AAF path.
- `GET /compose/stems` → import **generated** stems as sample layers (label
  clearly: generated composition stems, not source separation).

### 6.4 Self-learning loop

**Fix the export envelope first.** `RatingSessionView.exportRatings`
(`RatingSessionView.tsx:131-136`) builds an inconsistent envelope: sessions =
all-time (`fetchRatingSessions()`), choices = current session only
(`summaryChoices`, which lack `aHash`/`bHash`/`kind`). No consumer can join
these. Build a **per-session** envelope from `fetchRatingChoicesBySession(
session.sessionId)` (`ratingDB.ts:75`) + `fetchEloStandings()` (`ratingDB.ts:110`)
via `buildExportEnvelope` (`export.ts:35`). Do this regardless of upload.

**Mapping — and its honesty.** Recourse consumes an **absolute 1–5 per
(style,seed,bars)** (`/compose/rate`) or a **scalar reward** (`/learn/episode
{externalScore}`). SoundLab produces **pairwise Elo deltas**. Different scales.
Two options, both approximations:
1. **Scalar reward** — derive one number per session (confidence-weighted mean
   |ΔElo|, normalized) and submit via `/learn/episode`. Simple; loses *which*
   music won.
2. **Winner→rating** — for composer-originated batches, submit the winner's
   `(style,seed,bars)` with a rating derived from its Elo and the loser lower.
   Only meaningful when the variations actually came from a Recourse brief.

Label this an approximation in the UI. **Do not merge the two ranking systems**,
and never present Recourse's learned state as SoundLab's Elo.

**Consent and copy.** `RatingSessionView.tsx:54-56` promises ratings "never
leave the device unless you export them." That text must change before any
upload path exists. Since Recourse runs on localhost, accurate wording is
achievable ("sent to your local Recourse instance on this machine"), but it
still needs explicit opt-in tied to the toggle — not a silent default.

**Read-back.** Surface `GET /compose/learned` in the composer panel. SoundLab's
local Elo stays the system of record for variation parent selection; Recourse's
composer-learner is a separate, clearly-labelled signal.

### 6.5 Honest limits

- What Recourse "learns" here is **composer-brief adjustment** (chord/style/quality
  biases), not a taste model for arbitrary sounds. Do not present it as more.
- Recourse is heavyweight: 219 MB `recourse_storage.json`, autopilot crons, a
  self-modifying promotion loop, an Ollama dependency. Optional-and-off is what
  keeps that from becoming SoundLab's problem.
- Phase 6 does **not** fix the §14 pre-work (undo core, registry, clamps,
  snapshot coverage). It is additive.

### 6.6 Verification

- **Disabled:** toggle off ⇒ assert zero network calls (spy on `fetch`); UI hidden.
- **Offline:** server down, toggle on ⇒ bounded timeout, clear error, no hang, no
  retry storm.
- **Enabled:** mock server fixtures for styles/song/learned/suggest; assert the
  mappings and that rating upload is attempted once per completed session,
  non-blocking.
- New files must meet the 90% new-code coverage gate.

### 6.7 Files

New: `src/store/integrationStore.ts`, `src/lib/recourseClient.ts`
(timeout-wrapped fetch + mappers), `src/components/IntegrationSettingsPanel.tsx`,
plus tests.
Changed: `EvolutionPanel.tsx:76`, `RecourseComposerPanel.tsx:40`,
`recourseSong.ts`, `recourseEvolution.ts`, `RatingSessionView.tsx:54-56,131-136`,
CSP in 4 config files.
Recourse-side (separate repo): CORS + `OPTIONS`, gate mutating routes, bind
`127.0.0.1`, optional documented completion endpoint.

---

## 9. Sequencing and dependencies

- **Phase 0 is a hard gate** for Phase 1: it decides B1 vs B2 vs B3, whether
  anything is bundled at all, and therefore the CI strategy (Gate B).
- **Phase 2 is a hard gate** for Phase 3 and the "undoable" claim. Do not ship
  the NL layer against the current incomplete snapshot.
- **Phase 1** (Rust/sidecar) is independent of Phases 2-5 after Phase 0.
- **Phase 4** depends only on Phase 3.1 (provider) — it can start once the
  provider exists, in parallel with 3.2/3.3.
- **Phase 5** is independent of all AI work and can parallelize with Phase 1.
- **Phase 6** (optional Recourse) depends on the §14 pre-work (#1-5 undo core,
  #6/#7 network + secrets) and on the Recourse-side blockers C1-C4. It is
  independent of Phases 1-5 otherwise and can run in parallel once the toggle
  store and CSP change land.

Suggested order for a single track: **2 → 3.1 → 3.2/3.3 → 4 → 5**, with **6**
after the §14 P0 items, and **0 → 1** (stems) slotted in whenever the Gate A/B
decisions are settled.

---

## 10. File touch matrix

### New files

| File | Phase |
|---|---|
| `src-tauri/src/separate/mod.rs` | 1.1 |
| `src-tauri/src/separate/commands.rs` | 1.1 |
| `src/components/StemSeparationPanel.tsx` (+ `.test.tsx`) | 1.4 |
| `src/lib/ai/provider.ts`, `openaiCompatible.ts`, `ollama.ts` | 3.1 |
| `src/lib/ai/keychain.ts` | 3.1 |
| `src/lib/ai/interpret.ts` (+ test) | 3.2 |
| `src/lib/ai/enrich.ts` | 4 |
| `src/store/aiProviderStore.ts` | 3.1 |
| `src/components/AiCommandPanel.tsx` (+ test) | 3.3 |
| `src/lib/opsSessions.ts` | 5.1 |
| `src/store/opsStore.ts` | 5.2 |
| `src/components/SessionHubPanel.tsx` (+ test) | 5.2 |

### Modified files

| File | Phase | Change |
|---|---|---|
| `src-tauri/Cargo.toml` / `Cargo.lock` | 1.1 | `tauri-plugin-shell` |
| `src-tauri/src/lib.rs` | 1.1 | module + plugin + handler registration |
| `src-tauri/capabilities/default.json` | 1.1 | scoped shell permission |
| `src-tauri/tauri.conf.json` | 1.1 | `bundle.externalBin` |
| `src-tauri/build.rs` (no-op) | — | validated via tauri-build; no edit |
| `.github/workflows/release.yml` | 1.2 | build sidecar before tauri-action |
| `.github/workflows/ci.yml` | 1.2 | Linux sidecar / platform gate |
| `.gitignore` | 1.2 | sidecar binary handling |
| `src-tauri/binaries/*` | 1.2 | frozen sidecar artifact(s) |
| `src/lib/controller/actions.ts` | 2.1 | registry metadata + new actions |
| `src/lib/commands.ts` | 2.1 / 3.3 | spec alongside `run`; optional `AI` group |
| `src/lib/appCommands.ts` | 2.1 | derive from registry |
| `src/store/historyStore.ts` | 2.2 | snapshot fields + `snapshotsEqual` |
| `src/App.tsx` | 1.4 / 3.3 / 5.2 | mount panels, register modals, snapshot deps, commit effect, `TabType` render |
| `src/lib/workflowStages.ts` | 5.2 | new tab/stage (only if hub is a screen) |
| `src/lib/db.ts` | 5.1 | `version(7)` + `opsSessions` |
| `src/lib/sampleLibrary.ts` | 4 | optional non-indexed stem fields |
| `src/components/SampleBrowser.tsx` | 4 | enrichment hook (fire-and-forget) |
| `src/lib/folderLink.ts` | 4 (optional) | optional `afterSave?` on `FolderScanDeps` |
| `src/lib/analytics.ts` | 3.1 | LLM usage event |
| `src/vite-env.d.ts` | 3.1 | declare any `VITE_*` AI flags |

### Must NOT change for the sidecar

`vercel.json`, `.headers`, `nginx.conf` (web-only; sidecar is desktop-gated).
`vite.config.ts` / `tsconfig.json` / `vitest.config.ts` unless a new alias is
needed.

---

## 11. Open decisions (resolve before the referenced step)

1. **B1 (frozen `audio-separator`/torch) vs B2 (thin ONNX runner) vs B3
   (optional download pack).** Gate A. Decide from Phase 0's decision matrix
   (Step 0.8), not from download sizes.
2. **Bundle the runtime or download it on first run.** Recommend download (B3)
   unless the frozen size is Green; then bundling via `externalBin` is fine.
   Weights download on first run under every option, with consent + hash
   verification + a `license` field per model (Gate C).
3. **`externalBin` CI strategy** (commit Linux artifact / per-platform config /
   release-only injection). Gate B.
4. **Which models ship enabled** in the picker, pending a per-weight commercial
   license audit (Gate C).
5. **Key storage:** OS keychain (desktop) + session memory (web) vs a
   user-supplied local proxy. Affects UX and threat model.
6. **Ops hub placement:** a new stage vs a tab under an existing stage. Affects
   `workflowStages.ts` and navigation.
7. **Whether to lift Beat Studio per-pad state into a store.** Today it is local
   `useState` reachable only via `sequencerBridge` while the tab is mounted
   (`StudioSequencer.tsx:854-877`), so an NL "set pad tune" silently no-ops
   off-tab. Either lift it (real work) or document the limitation.
8. **Recourse feedback mapping (§8, step 6.4):** scalar reward via `/learn/episode`,
   or winner→rating via `/compose/rate`. Both are approximations of SoundLab's
   pairwise Elo; pick one and document it, or ship read-only (consume
   `/compose/learned` + `/compose/suggest` without submitting ratings).
9. **Do we add a documented completion endpoint to Recourse?** Required if
   Recourse is to serve as SoundLab's AI gateway (§8 raises the CSP/secret wins,
   but no usable prompt→completion route exists today).
10. **Rating-upload consent UX** — how the opt-in is presented and how the
    privacy copy at `RatingSessionView.tsx:54-56` changes.

---

## 12. Global invariants (verify after every step)

- `npm run lint` (`tsc --noEmit`), `npm test` (Vitest), and
  `npm run test:e2e` (Playwright) pass.
- New frontend code satisfies `npm run coverage:check` (90% on added lines,
  80% floor for new files). Rust changes are outside that gate but still need
  `cargo test --all-targets` green in the `backend` job.
- The web build stays IPC-free and deployable to Vercel; `isTauri()`-gate every
  new Tauri call.
- Everything new that mutates audio is undoable via `historyStore` (after Phase 2)
  and versioned.
- Existing features never regress: synth triggers, layer FX, `exportWav` master,
  master rack, chops, AAF export/import.
- **Never commit secrets or API keys.** Keys live in the OS keychain or session
  memory, never in Dexie, `.nsl`, or git.
- **Never present non-measured output as measured.** Auto-tagging phrases
  measured features; separation uses real UVR weights.

## 13. Rollback strategy

Each phase merges via its own PR. The stable surfaces are the typed action
registry (Phase 2.1) and the `HistorySnapshot` shape (Phase 2.2); keep both
additive so reverting a later phase cannot corrupt saved projects. The sidecar
is isolated behind the `separate` module + `externalBin`; removing the config
entry and the module registration fully removes it. Provider config is additive
and off by default, so reverting Phase 3 leaves the app byte-identical.

---

## 14. Remediation backlog — must clear before adding on

Found during reconnaissance. Nothing in Phases 3-6 is honestly deliverable on
top of the P0 items. `[VERIFIED]` = confirmed by a run/read; `[GAP]` = missing
capability; `[LATENT]` = present but not yet triggered in production.

### P0 — Verified defects in the foundation

| # | Issue | Evidence |
|---|---|---|
| 1 | **Undo is off-by-one.** `commit` pushes the *current* state, so `past` always ends with the live state; `undo()` pops and re-applies it → no-op. Two clicks per one revert. | `[VERIFIED]` scratch test failed (expected 120, got 140). `App.tsx:218-238`, `historyStore.ts:119-128` |
| 2 | **`canUndo` is phantom.** True after a single edit with nothing to revert. | `[VERIFIED]` test failed. `historyStore.ts:141` |
| 3 | **Redo dies after undo.** The applier re-triggers the commit effect, which clears `future`; the dedup compares the wrong entry. | `[VERIFIED]` `historyStore.ts:90`, `App.tsx:237` |
| 4 | **Transactions unexercised.** `beginTransaction`/`endTransaction` never called in production; tests encode current behavior. Multi-step AI cannot coalesce into one undo step. | `[VERIFIED]` only `historyStore.test.ts:100-133` |
| 5 | **`snapshotsEqual` omits fields → silent non-commit.** Any field not compared never creates an undo entry. | `[VERIFIED]` `historyStore.ts:172-184` |

### P0 — Runtime blockers for any network feature

| # | Issue | Evidence |
|---|---|---|
| 6 | **CSP blocks all outbound fetch, both builds.** Tauri `connect-src ipc: http://ipc.localhost`; web `connect-src 'self'`. Blocks cloud LLMs, Ollama, and Recourse. | `[VERIFIED]` `tauri.conf.json:26`, `vercel.json:18`, `.headers:7`, `nginx.conf:10` |
| 6b | **Existing Recourse fetches are already broken in prod** — un-gated and blocked by CSP. Works in Vite dev only. | `[LATENT]` `recourseSong.ts:77,88`, `recourseEvolution.ts:34` |
| 7 | ~~No secret storage~~ **RESOLVED (Phase 3.1)** — Keywire owns secrets; SoundLab holds a session-memory service token and fetches the key at runtime; Rust-side egress. | done 2026-09-17 |

### P1 — Missing foundations the NL layer requires

| # | Issue | Evidence |
|---|---|---|
| 8 | **No typed action registry.** Palette takes 1 store setter (`setBpm`); MIDI catalog is string-keyed but value-only (no type/range/enum). | `[VERIFIED]` `commands.ts:12-21`, `actions.ts:171-304` |
| 9 | **Inconsistent clamps.** BPM 30–300 (store) vs 60–200 (palette/controller); swing fraction vs percent. | `[VERIFIED]` `patternStore.ts:186`, `appCommands.ts:51-53` |
| 10 | **Missing atomic actions.** No `toggleCell`, no `setVelocity` — read-modify-write only. | `[GAP]` |
| 11 | **Beat Studio pad state is unmounted-only.** Local `useState`, reachable only via `sequencerBridge` while the tab is mounted; NL "set pad tune" silently no-ops. | `[VERIFIED]` `StudioSequencer.tsx:854-877` |
| 12 | **Reactive commit + hardcoded dep list.** Stores the AI mutates that aren't listed are never recorded. | `[VERIFIED]` `App.tsx:239` |
| 13 | **No provider/cost infrastructure.** `trackEvent` is an event log; no token/cost accounting. | `[GAP]` `analytics.ts:32` |

### P1 — Undo coverage gaps (Gate D)

| # | Issue | Evidence |
|---|---|---|
| 14 | Snapshot omits `arrangement`, `buses`/`layerSends`, `masterDynamics`/`sidechains`, reference track, controller config. | `[VERIFIED]` `historyStore.ts:23-39` |
| 15 | `rackStore.updateModule` bypasses its own history — rack param tweaks aren't undoable even by `rackStore.undo`. | `[VERIFIED]` `rackStore.ts:123` |
| 16 | `applyHistorySnapshot` doesn't restore those either. | `[VERIFIED]` `App.tsx:186-200` |

### P2 — Adjacent correctness

| # | Issue | Evidence |
|---|---|---|
| 17 | Autosave drops the master rack. | `[VERIFIED]` `App.tsx:673` |
| 18 | `addLayer` auto-auditions — surprising for batch/multi-layer ops. | `[VERIFIED]` `App.tsx:978-981` |
| 19 | ~~Demo gate is a cosmetic overlay~~ **RESOLVED** — paid tier removed; demo/paywall modules deleted, app is free and ungated. | done 2026-09-17 |
| 23 | Rating export envelope is inconsistent: sessions = all-time, choices = current session only, choices lack `aHash`/`bHash`/`kind`. | `[VERIFIED]` `RatingSessionView.tsx:131-136` |
| 24 | Rating store has a duplicated `set({ standings })`. | `[VERIFIED]` `store.ts:210-211` |

### P2 — Process

| # | Issue | Evidence |
|---|---|---|
| 20 | Tests assert *clickability*, not restoration — why #1-3 shipped. | `[VERIFIED]` `App.extra.test.tsx:129`, `App.coverage.test.tsx:257` |
| 21 | The 90% new-code coverage gate applies; fixing #1-4 means rewriting existing undo tests. | `scripts/check-new-code-coverage.mjs` |
| 22 | New modals need wiring in `otherModalOpen`, the Escape chain, and the keyboard dep array or shortcuts leak. | `App.tsx:736-742,842` |

### Recommendation

Fix **P0 first** (undo core #1-5, then network/secrets #6-7), then **P1** registry
and coverage, then start Phases 3-6. The stems backlog (Gates A-D, `externalBin`
Linux CI break, dev-tagged `onnx-weekly` dependency, installer size) remains
parked with Phase 0.

**Progress:** #1-4 (undo core), #17 (autosave rack), #19 (paid tier), #23
(rating envelope) are done. #5 (snapshot field coverage) is partially done via
#1-4's transaction work but still needs the new snapshot fields.

---

## 15. Phase 7 — MIDI controller integration platform

**Why:** SoundLab is free and open source (Apache-2.0). The growth path is
partnering with smaller MIDI controller makers to ship SoundLab bundled with
their hardware. Today the only device profile is hardcoded
(`src/lib/controller/defaultMpd226.ts`), so adding a controller requires core
code changes — that is the blocker to any partner program.

**Existing assets to build on (no rewrite):**
- Action catalog: `src/lib/controller/actions.ts` (`ACTION_DEFS`, `ActionGroup`,
  `dispatchAction`, `catalogForContext`, `describeAction`, `isContinuousAction`).
- Mapping + learn: `mapping.ts` (min/max/invert), `controllerStore` learn mode
  (`startLearn`/`armLearn`/`learnMode`), `ControllerAssignPanel.tsx`.
- Ingest/transport: `midiBridge.ts`, `surface.ts`, `useControllerMidi.ts`.
- Layout template: `Mpd226Layout.tsx`.
- Test harness: `ControllerHost.test.tsx`, `midiBridge.test.ts`,
  `surface.test.ts`, `actions.test.ts`, `mapping.test.ts`.

**The shared backbone:** the typed action registry (Phase 2, Step 2.1) is
required by both the NL layer and vendor profiles — a profile is a mapping from
physical controls to catalogued actions with declared ranges/enums. Build it once.

**Deliverables:**
1. `ControllerProfile` schema (versioned JSON): device id/name, control surface
   (pads/knobs/faders/buttons), default bindings, optional layout id, optional
   vendor metadata (url, logo).
2. A **profile registry** replacing the hardcoded import — ship the existing
   MPD226 as *data*, not code.
3. Import/export of profiles (file + clipboard) so a vendor or user can author
   one without a build.
4. Optional per-device layout component registered by id (template:
   `Mpd226Layout.tsx`).
5. Vendor hooks: display name, link, optional brand asset — loaded only when a
   profile is active, kept out of the core bundle.
6. `docs/controller-profiles.md` — schema + authoring guide so a partner can
   self-serve.

**Vendor-fit criteria (be honest about which devices are viable):** the
architecture assumes a MIDI surface mapped to a fixed action vocabulary. Devices
sending standard Note/CC messages fit immediately. Devices with proprietary
sysex/host protocols, or needing bidirectional display feedback, require extra
work and must be scoped individually.

**Verification:** profile round-trip (export → import → identical bindings); a
registry-driven profile reproduces today's MPD226 default; `ControllerHost.test.tsx`
still passes; new profile code meets the 90% new-code gate.

### Licensing policy (applies to all phases)

The app is Apache-2.0 and free. Prefer **MIT / Apache-2.0 / BSD / ISC / MPL-2.0**
dependencies so hardware partners can embed and redistribute it. Copyleft
(GPL/AGPL) is *permissible* in an open-source project, but it would effectively
**relicense the combined work** and impose source disclosure on partners — so
treat any copyleft dependency as a deliberate project-level decision, never a
convenience. In particular **Essentia.js (AGPL-3.0)** and **aubio (GPL-3.0)** are
not drop-in options for the bundled web build; the permissive path for audio
analysis is **Meyda (MIT) + Tonal (MIT)**, both already installed. Verified: no
GPL/AGPL dependencies today.

### OSS component picks (permissive)

| Need | Pick | License |
|---|---|---|
| Key/BPM/chroma analysis | Meyda + Tonal *(installed)* | MIT |
| Local LLM | Ollama / llama.cpp / transformers.js | MIT / MIT / Apache-2.0 |
| In-browser ML | transformers.js + ONNX Runtime Web | Apache-2.0 / MIT |
| Native ML (Tauri) | `ort` (ONNX Runtime) | Apache-2.0/MIT |
| Semantic sample search | transformers.js CLAP + LanceDB *(or brute-force IndexedDB)* | Apache-2.0 |
| MIDI file I/O | `@tonejs/midi` | MIT |
| Action param validation | `zod` | MIT |
| Stems *(deferred)* | `audio-separator` / Demucs | MIT wrapper / MIT — **weights licensed separately** |
