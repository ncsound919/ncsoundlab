# Mobile Field Design — Build Plan (from NC Sound Lab)

## Roles mapped from ncsoundlab pieces
| Desktop piece | Mobile role |
|---|---|
| Sound Lab synth | Sub/body/noise layer generator under/over recording |
| Layer Mixer | Recording = another layer type |
| Waveform Editor | Trim, normalize, pitch, saturate the slice |
| Evolution / Randomizer | Round-robin variants of one recording |
| Meyda | Onset slicing + spectral-centroid “this is thin, add sub” |
| SoundTouch / Tonal | Tune slices to root note |
| Kit catalog + JSZip + cover art | Field kits, art seeded by place/time |

## New to build (ordered)
1. Native capture (AudioRecord, UNPROCESSED, 24-bit float WAV, foreground service, Android 14 declared service type + permission, Bluetooth block, USB-C phase later)
2. Onset slicer (Meyda onset detection on pre-roll buffer)
3. Cleanup DSP (low-cut, gate, spectral denoise, DC removal, de-click, fades)
4. Pitch detection (on-set + tonic root lock)
5. Pre-roll buffer (10–20 ms attack preservation for transient lock)
6. Field metadata (GPS/time/place seed for cover-art generation)
7. Mobile UI — new component tree on shared engine, NOT responsive tweak

## Shared engine boundary (src/audio + src/lib)
- No React imports, no Tauri imports inside engine
- AudioContext and storage injected (not imported)
- Start: path alias + lint rule banning those imports; promote to workspace package when stable
- Storage adapter: desktop = IndexedDB (Dexie); mobile = filesystem audio + Dexie metadata only
- Coverage gate: 90% new-code; catches mobile-side engine regressions

## Genome / Variant system (not audio — reproducible from seed)
- Genome = parent reference + seed + parameter vector (layer stack, filter, pitch, granular scatter, bitcrush, ...)
- Variant = reproducible JSON (few hundred bytes), renders off-line on demand
- Memory: hold genomes, not buffers. Render one child at a time into pooled Float32Array; keep few audition buffers alive
- Swipe grid: show 8 children. Tap = audition, swipe = keep/trash, breed two keeps (crossover layers + params). Mutation-strength slider. Lock toggles.
- Transient lock: mutation applies only after attack (first 10–20 ms). Toggle.
- Auto-filter before viewing: reject clipping, DC offset, silence, over-long tails. Meyda features drop near-duplicate siblings → diverse grid. Deterministic, no LLM.
- Round-robin export: evolve N variants → named group in kit manifest.

## LLM rules (assistant = Qwen3.5 4B, 4-bit Q4_K_M ~2.5–3.01 GB, ARM SIMD, NDK r27 + CMake, native wrapper from Apache-2.0 SmolChat-Android)
- LLM never touches audio. Turns language → structured edits.
- Constraint: llama.cpp grammar / JSON-schema against engine param schema.
- Engine clamps values; UI shows preview to accept/reject.
- Zero network access: import model via system file picker (not download). Drop INTERNET from release manifest.
- Dev builds: Tauri generates Vite server need — check Tauri config.

## Android 14 / manifest requirements
- Foreground service type declared + permission (`FOREGROUND_SERVICE_MICROPHONE`, `FOREGROUND_SERVICE_DATA_SYNC`, etc.)
- `UNPROCESSED` AudioRecord source — check `MediaRecorder.AudioSource.UNPROCESSED` support at runtime (device-dependent)
- Block Bluetooth mics for capture (drop to narrowband); USB-C class-compliant interfaces phase 2
- No `INTERNET` permission in release manifest; keep for dev if Tauri needs Vite

## Alignment with phone beat (`C:\Users\tap45\Downloads\phone beat`)
- C++17 engine (`engine/`), Kotlin/Compose UI, JSON inside ZIP (`.ncbeat` / `.ncfield`)
- Imports audio via `AudioFileImporter`; uses `SessionPackageExporter`; 48 kHz stereo stems
- Inter-app: SAF (`ACTION_OPEN_DOCUMENT`) for archive handoff — no shared private storage
- Same architecture for field app: C++ DSP engine via NDK, Compose UI, JSON kit format, ZIP package
