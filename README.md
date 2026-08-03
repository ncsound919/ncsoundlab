# NC Sound Lab

A web-based beatmaker and sound design workstation built with React, Vite, and the Web Audio API. Local-first — no accounts, no cloud, no API keys.

![brand](public/logo.png)

## Features

- **Sound Lab** — procedurally synthesize drums, 808s, leads, pads, textures and chaos-FX with a full chaos-synth DSP engine (ZDF ladder filter, hard-sync, unison, FM/RM, wavefolding, bitcrush, granular scatter).
- **Layer Mixer** — per-layer gain/pan/pitch, A/B soloing, FX chain (EQ, compressor, saturation, reverb, tape delay, chorus, transient shaper).
- **Compare Engine** — load a reference track and your mix, A/B switch with level matching, true EBU R128 / BS.1770-4 integrated loudness (via `bravoh-loudness`), peak/RMS meters, stereo width.
- **Sound Kit Catalog** — local catalog of published kits, favorites, procedural cover art (deterministic seed-based, no AI API), WAV export via JSZip.
- **Waveform Editor** — destructive DSP on selections (trim, normalize, pitch shift, saturation, bitcrush, reverb, stereo widening).
- **Studio Rack** — drag-and-drop FX modules: EQ, compressor, limiter, saturator, tape, exciter, delay, reverb, chorus, flanger, phaser, tremolo, imager.
- **Smart Randomizer** & **Evolution Engine** — generate mutations of any sample.
- **Local persistence** — kits, projects, and favorites stored in IndexedDB via Dexie. No server.

## Tech stack

- **React 19** + **Vite 6** + **TypeScript 5.8**
- **Tailwind CSS 4**
- **Zustand** (state), **lucide-react** (icons), **motion** (animations)
- **Web Audio API** (custom DSP — chaos synth, ZDF ladder, tape delay, convolution reverb)
- **[Meyda](https://github.com/meyda/meyda)** — spectral feature extraction (RMS, ZCR, spectral centroid) for sample analysis
- **[bravoh-loudness](https://www.npmjs.com/package/bravoh-loudness)** — BS.1770-4 / EBU R128 integrated LUFS for the Compare Engine
- **[Dexie](https://dexie.org/)** — IndexedDB wrapper for local persistence (no backend)
- **JSZip** — WAV + cover-art bundle export
- **Vitest 4** + **jsdom** + **Playwright** (unit + e2e)

## Quick start

**Prerequisites:** Node.js 20+ (developed on Node 24).

```bash
npm install
npm run dev          # http://localhost:3000
```

### Build for production

```bash
npm run build        # outputs to ./dist
npm run preview      # serve ./dist locally
```

### Lint, test, e2e

```bash
npm run lint         # tsc --noEmit
npm test             # vitest run (unit + component)
npm run test:e2e     # playwright test
```

> **Note on `evolutionEngine.test.ts`:** this suite forks a Vitest worker that, on some Windows sessions with a constrained virtual-memory commit (small/disabled pagefile, Memory Integrity + Mandatory ASLR, Defender scanning, or a parent job object with a per-process commit cap), is denied its first semi-space `VirtualAlloc` and aborts with `Committing semi space failed`. That is an OS-level commit denial, not a V8/Vitest issue. Set `CONSTRAINED_ENV=1` in the shell that runs `npm test` to skip it on the affected machine; on a healthy dev box or CI, leave it unset.

### Clean

```bash
npm run clean        # cross-platform: removes ./dist and ./server.js
```

## Configuration

No environment variables are required. The app is fully local-first:

- Sound kits, projects, and favorites are stored in IndexedDB (`soundlab-db` database).
- Cover art is generated deterministically from `(title, producer, era, seedOverride)` using the agent pipeline in `src/components/coverArtAgents.ts` — no external API.

The optional `CONSTRAINED_ENV=1` env var is only used to skip the OS-sensitive test described above.

## Deployment

NC Sound Lab is a static SPA that ships in two forms:

- **Public web demo** (Vercel) — the full tool, hosted so anyone can try it.
- **Desktop product** (Tauri) — a native Windows EXE for paid private copies; runs offline, all data stored locally.

### Desktop (Tauri)

Prerequisites: Rust (stable) + WebView2 Runtime (preinstalled on Windows 10/11).

```bash
npm install
npm run tauri:dev     # run in dev (Vite + WebView2 window)
npm run tauri:build   # production build
```

Outputs:

- `src-tauri/target/release/nc-sound-lab.exe` — portable executable
- `src-tauri/target/release/bundle/nsis/*-setup.exe` — Windows installer

The desktop build is fully self-contained and offline. Kits, projects, and favorites persist locally via IndexedDB in the app's own WebView2 data folder.

### Web demo (Vercel)

The `vercel.json` in the repo root configures the SPA rewrite (deep links return `index.html`) and serves production security headers. Deploy with:

```bash
npm run build
vercel --prod
```

Or connect the repo to Vercel and it auto-detects Vite (build command `npm run build`, output `dist`).

### Static hosting (alternative)

Build the production bundle and serve the `dist/` folder:

```bash
npm run build
```

Then deploy `dist/` to any of:

- **GitHub Pages** — push `dist/` to the `gh-pages` branch
- **Netlify** — connect your repo; Netlify auto-detects Vite builds
- **AWS S3 + CloudFront** — sync `dist/` to an S3 bucket with static website hosting
- **Any static host** — upload the contents of `dist/`

### Security headers

A `.headers` file, `nginx.conf`, and `vercel.json` header config are included with recommended security headers (CSP, HSTS, X-Frame-Options). Apply these in your hosting platform's header configuration.

### Fonts

All fonts are self-hosted in `public/fonts/` — no external CDN dependency.

## Project structure

```
src/
  audio/           # AudioEngine, CompareEngine, SoundLayerPlayer, dsp/ (AnalogEngineDSP, TapeDelayDSP, ConvolutionReverbDSP, AdvancedCompressor, AdvancedParametricEQ)
  components/       # React UI
  lib/              # Audio utils, Dexie DB, batch audio processor, chaos synth, evolution engine, sound presets
  store/            # Zustand stores (rack, compare engine)
  tests/            # vitest setup (jsdom mocks for AudioContext)
  types.ts          # All shared TypeScript types
public/
  logo.png          # Brand logo (used in sidebar + top header)
  fonts/
    fast-blaze.otf  # Brand display font (`.font-fastblaze` utility)
e2e/                # Playwright e2e specs
```

## Brand assets

The app's display font and logo are local-first too:

- `public/fonts/fast-blaze.otf` → exposed as the CSS font `Fast Blaze`, used via the `font-fastblaze` Tailwind utility (`src/index.css`).
- `public/logo.png` → referenced as the favicon (`index.html`) and as the brand mark in the sidebar and workspace header (`src/App.tsx`).

## License

Apache-2.0 — see source file headers (`SPDX-License-Identifier: Apache-2.0`).
