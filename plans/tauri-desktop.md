# Desktop Product Plan — NC Sound Lab "Studio Desktop" (Tauri)

**Strategy:** Two tracks, no client-side gating. The public web demo is the full tool; the paid product is a native **Tauri desktop EXE** that wraps the same codebase, runs offline with local IndexedDB persistence. Revenue = selling the desktop copy + recurring updates/support.

**Mode:** Direct (no git repo tracked). Windows/x86_64 target, WebView2 Runtime present.

**Guiding decision (from user):**
- No gating/license checks. Sell the copy + updates/support.
- Public demo on Vercel.
- Desktop EXE via **Tauri v2** (chosen over Node SEA for native-window feel, small binary ~10–15MB, isolated persistent IndexedDB via WebView2 partition, professional installers).
- Strict dev/prod split: Vercel serves static `dist/`; Tauri serves the SAME `dist/` as native assets. **No server.js required** — Tauri uses the asset protocol.

---

## Architecture Notes (read this first)

- The React/Vite app is shared 100%. No feature forks.
- Vite `vite build` → `dist/`. Tauri `frontendDist` maps to that same folder.
- **No backend server exists or is added.** Tauri v2 serves built assets via `tauri://localhost` / asset protocol, not an HTTP listen server. `server.js` stays removed.
- Data persistence: IndexedDB lives in the WebView2 user-data partition (`userDataFolder` → `nc-soundlab`). "Everything saves locally" ✓ persists across app restarts.
- Web Audio API + `wavesurfer` + `meyda` + `bravoh-loudness` all run in WebView2 (Chromium-based). Verified support — but a smoke test is mandatory given this is DSP-heavy.
- CSP: Tauri enforces a window CSP separately from web hosting. The config has its own `app.security.csp` and must allow `connect-src ipc: http://ipc.localhost` if IPC is used.

## File layout expected after this plan

```
src-tauri/
  Cargo.toml
  build.rs
  tauri.conf.json
  capabilities/default.json
  icons/            (generated from public/logo.png)
  src/main.rs
  src/lib.rs
public/
  ... (unchanged, still served statically for web build)
```

Changes to existing files:
- `package.json` — add `@tauri-apps/cli` (devDep) + `@tauri-apps/api` (dep) + `tauri` scripts.
- `vite.config.ts` — set `base: './'` so `dist/` is deployable to subpaths / portable for desktop.
- `README.md` — add Desktop install + license/sales model.
- Optional `metadata.json` — expose version + `import.meta.env` edition so build can display `vX.Y` + `Desktop PRO` for support triage.

---

## Step 1 — Scaffold Tauri shell (+prerequisites)
**Context:** Stand up `src-tauri/` and app shell. Rust 1.93 present; Tauri CLI must be added to devDeps. Installs NSIS/strong tooling automatically on first build.

**Tasks:**
- `npm i -D @tauri-apps/cli`
- `npm i @tauri-apps/api`
- Run `npx tauri init` with: name "NC Sound Lab", window title, distDir `../dist`, devUrl `http://localhost:3000`, no device plugins requested, `.ts` frontend, identifier `com.ncsonic.soundlab`.
- Confirm `src-tauri/Cargo.toml`, `rust-analyzer` works.

**Verification:**
```
npm run dev            # vite on :3000
npx tauri dev          # opens WebView2 window loading the app shell
```
Exit: Native window opens showing the app UI.

**Rollback:** delete `src-tauri/`, remove the two npm deps.

---

## Step 2 — Configure `tauri.conf.json`
- `productName`: "NC Sound Lab Studio"
- `identifier`: `com.ncsonic.soundlab`
- `app.windows[0]`: `title`, `width: 1500`, `height: 950`, `minWidth`, `resizable: true`, `fullscreen: false`, `center: true`.
- `build.devUrl`: `http://localhost:3000`; `build.frontendDist`: `../dist`.
- `app.security.csp` (mandatory, Chromium warning if absent):
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ipc: http://ipc.localhost; media-src 'self' blob:`
- `bundle.active`: `["nsis"]`; `bundle.targets`: `["nsis"]` (add portable later); `bundle.createUpdaterArtifacts`: false for now.
- `app.userDataFolder`: `nc-soundlab` (isolation + clear IndexedDB location).

**Verification:** `npx tauri build` runs without CSP/register errors. (If build slow, run later — defer validation to Step 4.)
**Rollback:** revert config; keep scaffold.

---

## Step 3 — Vite base + build integration
- Set `base: './'` in `vite.config.ts` (`build` block). Portable to subdirs + matches Tauri relative asset loads.
- Add `package.json` scripts:
  - `"tauri": "tauri"`,
  - `"tauri:dev": "vite --port=3000 & "tauri dev"` (this is the orchestrator in the repo sample — adapt to your Windows shell w/ concurrent or sequential)
  - `"tauri:build": "vite build && tauri build"`
- Add optional `src/lib/edition.ts`:
  - expose `build info` from `import.meta.env.MODE`/`VITE_EDITION` so footer can show Desktop/none edition (opt-in, non-gating).

**Verification:** `npm run build` still produces `dist/` identical structure; `npx tauri build` compiles.
**Rollback:** unset `base`, drop the scripts.

---

## Step 4 — Web Audio / DSP / IndexedDB smoke test in WebView2
**Why mandatory:** DSP-heavy (Web Audio API, wavesurfer, meyda, bravoh-loudness) — test the whole audio chain inside Tauri's WebView2, not dev browser.

**Smoke checklist:**
- [ ] Synth pad triggers sound; audibly audible.
- [ ] `Master Meter` move, FX chain (EQ/comp/tape/reverb) works.
- [ ] DFT analysis runs (meyda) without errors.
- [ ] Load reference track in Compare Engine → loudness (bravoh) computes.
- [ ] Sampling: upload audio, waveform renders, chop/pitch/bitcrush.
- [ ] Save a kit / save session to IndexedDB → restart app → data persists.
- [ ] Export WAV + cover-art ZIP (JSZip) downloads.
- [ ] Cover art deterministic seed → same image twice.

**Verification:** all boxes pass; `window` console has no errors; no external network required (fully offline).
**Exit:** offline, self-contained, persistence confirmed.

---

## Step 5 — Icons + Windows bundling (installer + portable)
- Generate icons from existing `public/logo.png`: `npx tauri icon public/logo.png` (fills `src-tauri/icons/` 32x32/128/128/icon.ico/app icon).
- Set `bundle targets: ["nsis","portable"]`.
- Add `bundle.category: "Music"`, `shortDescription`, publisher metadata.
- Confirm NSIS downloads on first build.

**Verification:** `npx tauri build` produces:
  - `src-tauri/target/release/bundle/nsis/*.exe` (installer)
  - `.../bundle/portable/*.exe` (portable EXE)
Exit: both artifacts exist and run.

---

## Step 6 — Version & build metadata (support triage, non-gating)
- Hook `tauri.conf.json` `version` and `package.json` revision to `src-tauri/Cargo.toml` `version` (keep in sync).
- Optionally surface `ediition + version` in an app footer or About/Help modal (off by default; derived from `import.meta.env`).
- No license/DRM code — this is purely info + update hygiene.

---

## Phase C — Delivery & Release

## Step 7 — Vercel public demo deploy
- Create `vercel.json` (SPA fallback to `/index.html` to complement the `404.html`; set `cleanUrls: false`).
- (Repo not initialized yet — run `vercel login` / `vercel` CLI or connect GitHub repo; skip until repo exists.)
- Build command `npm run build`; output dir `dist`; framework Vite.
- Env: none needed.
**Verification:** `https://<project>.vercel.app` serves app; deep link `/studio` returns the SPA (no 404).
**Note:** `404.html` present; Vercel uses `vercel.json` rewrites — keep both.

---

## Step 8 — CI/CD for Desktop: GitHub Actions (release)
- `.github/workflows/desktop-release.yml` on **windows-latest**:
  - checkout → setup-node 24 → `npm ci` → `npm run build`
  - setup rust toolchain (stable) → `npm run tauri build`
  - upload artifacts: NSIS installers + portable EXE (and reproducible source build).
- Release trigger: push tag `v*`.
- (Requires repo exists.)

---

## Step 9 — Update channel (selling updates)
- Enable Tauri updater (browser window link) with a static JSON manifest hosted on Vercel or an endpoint; Tauri updates download signed payloads.
- Configure `app.security.assetNamespaces` conveniences/`dev` only to key, `bun.dh`? Using Tauri v2 updater plugin requires signing cert (Tauri ecosystem) — flag as a **later/production** decision pending budget.
- Interim: ship new `.exe`s; update flow via support channel.

---

## Step 10 — README + Sales/License docs
- Update `README.md`:
  - **Public demo** link (Vercel).
  - **Desktop** install instructions (`NC Sound Studio Desktop.exe` installer/portable), offline + local-save promise.
  - **License / purchase model**: no client DRM; you pay for the desktop build + tracked updates/support. Mention Apache-2.0 for the web open-source core vs the packaged desktop product (clarify internally what license you ship under to buyers).
- Add `LICENSE.DESKTOP.md` outlining the paid single-use/owned-title terms + support.

---

## Step 11 — Release scoring & launch
- Verify bundle on clean Windows (VM or second run) milestone.
- Publish Vercel demo + tagged release with installers.
- Document smoke-test sheet for buyers.

---

## Dependency Graph

```
Step 1 (scaffold)        <--
Step 2 (tauri.conf)      <- depends or Step 1
Step 3 (vite base/scripts) - depend on Step 1
Step 4 (WebView2 smoke)  <- depends: 1,2,3
Step 5 (packaging)     <- depends: 1,2,3,4
Step 6 (metadata/version)- depends: 1,2
--Phase C--
Step 7 (Vercel demo)    <- independent (repo required)
Step 8 (GitHub rel)     <- depends: 5 ; repo
Step 9 (updater)        <- depends: 8 (later)
Step10 (docs)           <- depends: 5,7,8
Step11 (release)       <- depends: 7,8,10
```

**Parallelizable:** Step 7 independent of 1–6; Step 6 can run alongside 4/5.

---

## Scope / must-decide later

- **Code signing** (SmartScreen unknown publisher without a cert). Buy EV/OV cert (yearly) or self-sign w/ warning for ~last-mile polish. Defer.
- **Auto-update** Tauri updater needs signing + hosting; defer to a later change. (Step 9 flagged.)
- **Storage parity** — verify the WebView2 store can be backed up/migrated when updating restrooms.
- **Offline guarantee** — fonts already and external network calls are zero (check helps confirm/guardlink).