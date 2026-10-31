# Deployment Readiness — NC Field (phone app gate)

This document gates the **phone app (NC Field)**: capture → slice → evolve → kit on a
real handset, offline-first, installable. The phone app is served from **Freebuff
Sites** (production published 2026-10-28, build `2026-10-28.3`).

**Website hosting is out of scope for this gate** — Vercel and other static-host notes
below are reference material only and block nothing. If the phone gate sections are
checked and iOS is accepted or handled, the phone app is ready to release.

Legend: `[x]` done and verified · `[ ]` required before publishing · `[!]` known limitation.

Last verified: **2026-10-28**

- Windows: `npm run lint` (`tsc --noEmit`), `npm run boundary:check`, `npm run build`
  and `npm run precache:check` exit 0. Full unit suite: **241 files / 2,795 tests passed**.
- Browser suite: `npm run test:e2e -- --workers=1` — **11 passed, 3 skipped**
  (the skipped specs need a physical MPD226).
- Real device: **Samsung SM-S938U (Galaxy S25 Ultra), Android Chrome**, driven over
  Wi-Fi ADB + Chrome DevTools: record → save → 4-way chop → merge/delete → evolve →
  shape (preset, layer, macro) → keep → kit → `.ncbeat` export, plus an offline reload,
  an installability audit, an installed WebAPK cold start in standalone mode, a
  wake-lock check on a real 19.5 s take, a Lighthouse PWA audit (100/100), an
  installed-update test (`.1 → .2 → .3`, saved take retained on every swap), and a
  phone-only precache verified on the handset (32 entries, no workstation chunks).
- iOS Safari is still untested: no Apple device is available in this environment.

---

## 0. What ships

- A static SPA. No server runtime, no database, no environment variables, no API keys.
- Two separate HTML entries: `/` (desktop workstation, `index.html`) and `/field.html`
  (phone field studio). Phones opening `/` are redirected to the field entry.
- PWA assets: `manifest.json`, Workbox `sw.js`, `workbox-*.js`, and `icons/*`.
- One worker with a **phone-first precache**: both entries share the service worker and
  its update lifecycle, but only the field entry's offline closure is precached (its
  chunks, the shared CSS/HTML/icons, the 14 design fonts and `manifest.json`). A phone
  install never downloads workstation chunks, and `npm run precache:check` enforces
  both directions (offline-complete *and* phone-sized).
- Persistence is browser-local (IndexedDB/Dexie); nothing to migrate or back up on the host.

## 1. Fixes in this pass

### Surface separation and hosting

- [x] **Phone and desktop shared one entry** — the field studio now has its own HTML/Vite
      entry (`field.html` → `src/field.tsx`); phones are redirected from `/`, old `#/field`
      links redirect, and the desktop stays on `index.html`. The manifest starts at
      `/field.html`.
- [x] **PWA files swallowed by the SPA rewrite** — `vercel.json` no longer rewrites
      `/sw.js`, `/workbox-*.js`, `/icons/*`, `/manifest.json` or `/404.html`.
- [x] **Hosting moved off expiring anonymous Vercel deployments** — the previous
      `vercel deploy --temporary` URL expired and Vercel now refuses another anonymous
      deploy (`Run vercel login`). A Freebuff Sites project serves the same `dist/` at a
      stable HTTPS origin; `sites/worker.mjs` mirrors the Vercel routing/headers.
- [x] **Sites `.html` canonicalisation handled** — the host 307-redirects
      `/field.html` to `/field` by default, which would have looped a `/field` rewrite.
      The Worker serves both HTML entries in place (200) and lets `/field` land on the
      field app.
- [x] **Phone installs downloaded the whole workstation** — the precache glob matched
      `**/*.js`, so installing NC Field fetched ~1.5 MB of workstation panels the field
      entry can never render (and it never precached the design fonts at all). The
      precache is now phone-first: 32 workstation-only chunks excluded, field closure
      verified complete (9 chunks + 14 fonts + `manifest.json`), workstation chunks
      fetched and cached at runtime on first use instead. Enforced by
      `npm run precache:check`, also wired as a CI step after build.

### Real-device fixes found in this pass

- [x] **Header storage readout was misleading** — an unsaved take showed `0 TAKES · 0 KB`
      while the recording existed in memory. The header now separates `N SAVED · KB` from
      the live take (`3.5S TAKE`), and the save control reads `Save take`.
- [x] **Phone header/calibration labels wrapped or truncated** — shortened the header
      subtitle line and calibration title; `USB / Field Condenser` now fits at 390 px.
- [x] **“1 slices” grammar** — singular/plural now switches correctly.
- [x] **`.ncbeat` downloaded as `.ncbeat.zip` on Android Chrome** — the Blob is now
      labelled `application/octet-stream`, which preserves the `.ncbeat` filename
      (verified on-device: `Field_Kit.ncbeat`).
- [x] **`exportedAt` was epoch zero** — `buildNcbeatManifest` stamped
      `1970-01-01T00:00:00.000Z`; it now uses the real export time and has regression
      tests for both the default and an explicit timestamp.

### Simpler chopping and sound design

- [x] **Even chop** — one-tap 4 / 8 / 16 equal parts (`sliceEvenly`), zero-crossing
      snapped, trimmed and measured like onset slices.
- [x] **Slice actions** — the selected slice can be auditioned, merged with the next slice,
      or deleted; the waveform flags still support fine dragging.
- [x] **Shape sheet replaces the old “Tweak Layers” stub** — a full-width bottom sheet with
      4 presets (Warm / Bright / Grit / Air), 7 live macros (brightness, pitch, grit,
      crush, texture, motion, level), a per-layer mixer (recording + Sub/Noise/Body/Synth,
      up to 4), attack protection, and **More like this** to mutate one variant again
      without starting a new round.
- [x] **Noise description** — unpitched layers read `noise @ 15%` instead of
      `noise 0/noise`.

## 2. Pre-deploy gate

Run from the repo root:

```bash
npm ci                 # or bun install (bun.lock is the local lockfile)
npm run lint           # tsc --noEmit
npm run test           # vitest run
npm run boundary:check # engine boundary rule
npm run build          # vite build -> dist/
npm run precache:check # phone gate: offline-complete + phone-sized precache
```

Checklist (run again after any change):

- [x] All six commands exit 0 (verified 2026-10-28).
- [x] `dist/` contains `index.html`, `field.html`, `assets/`, `sw.js`,
      `workbox-*.js` (currently `workbox-835c8c05.js`), `manifest.json`, `icons/`,
      `robots.txt`, `404.html`.
- [x] Two entries are built: `main-*.js` (boot + redirect) and `field-*.js` (field studio).
- [x] Phone precache gate: **32 entries / 2.5 MB** (was 49 / 3.1 MB before the split),
      field closure complete, 32 workstation chunks excluded.
- [x] Offline proof, twice: with the preview server killed outright the field entry
      still reloaded from the precache (Playwright), and the same reload worked on the
      handset with the network emulated off (CDP).
- [x] Browser suite: 11 passed, 3 skipped (physical MPD226 only).
- [ ] Optional coverage gate (what CI runs): `npm run test:coverage && npm run coverage:check`
      (needs a git base branch; not rerun in this pass — the full coverage run
      exceeds the 10-minute local command budget).

> Windows note: on a machine with a constrained pagefile, set `CONSTRAINED_ENV=1` to skip the
> OOM-sensitive evolution-engine test. Do not set it on CI or a healthy machine.

## 3. Hosting configuration

### Freebuff Sites (current phone origin)

- **Production URL:** `https://site-27e61d7eff374b2ca968fced46c54778.freebuff.page`
  (published, build `2026-10-28.3`, `field-BB6YbcQ7.js`)
- **Preview URL:** `https://site-edd3acae594c4dcda6d0a106f3c22541.freebuff.page`
- **Site ID:** `bda4da1b-10db-45cd-bf49-4a9e66e86df6` (also in `sites/site.json`)
- **Manifest:** `sites/deploy.json` — entrypoint `sites/worker.mjs`, assets `../dist`,
  compatibility date `2026-10-28`.
- **Worker:** serves `env.ASSETS`; serves `/index.html` and `/field.html` in place by
  fetching their canonical asset paths (`/` and `/field`), because the host otherwise
  307s `.html` URLs and would break the precached navigation entries; `/field` itself
  serves the field app; falls back to the desktop SPA for unknown extensionless
  navigations; adds CSP, HSTS, `nosniff`, frame/referrer/permissions headers; marks
  `/assets/*` immutable and `sw.js` / `manifest.json` / HTML no-cache.
- **Publication:** both preview and production are published and serving. Production
  is the install target (`field.html`) and runs the same `dist/` build.
- [x] `curl` checks pass on the live production origin (section 4).
- [x] Service worker controlling, both HTML entries in the 49-entry precache.
- [x] Offline reload of the installed SW shell verified on a physical phone.
- [x] Production publish (2026-10-28, `sites_set_published`); updating a published
      environment serves the new deployment without republishing.
- [ ] Attach a custom domain (optional).

### Vercel (out of scope — website hosting, not part of the phone gate)

- [ ] `npx vercel login`; anonymous temporary deployments now expire and cannot be renewed.
- [ ] Deploy with `npx vercel --prod` (or connect the repository and let Vercel auto-detect Vite).
- [ ] Confirm the build command is `npm run build` and the output directory is `dist`.
- [ ] Attach the production domain and confirm HTTPS (microphone and service workers require it).
- [ ] Confirm `vercel.json` is the deployed config: SPA rewrite, security headers, cache rules.

### Other static hosts (out of scope — website hosting)

- [ ] Serve at the **domain root**. `manifest.json` uses root-absolute `start_url`, `scope`
      and icon paths.
- [ ] Route `/field` to `/field.html` or link directly to `/field.html`. A host that
      rewrites everything to `index.html` will send phones to the desktop entry.
- [ ] If a subpath is unavoidable (`https://host/app/`), change Vite `base`, the manifest
      `start_url` / `scope` / icon paths, and the router prefix together, then re-run the gate.
- [ ] nginx: use the included `nginx.conf` (SPA fallback, CSP/HSTS, cache policy).
- [ ] Netlify-style hosts need a `_headers` file; `.headers` is the CSP text, not a
      host-specific config. Copy the header block from `vercel.json` or `sites/worker.mjs`.

## 4. Post-deploy HTTP checks

```bash
BASE=https://site-27e61d7eff374b2ca968fced46c54778.freebuff.page
# Preview (same routing): https://site-edd3acae594c4dcda6d0a106f3c22541.freebuff.page

curl -sI "$BASE/"                     # 200 text/html (desktop)
curl -sI "$BASE/field.html"           # 200 text/html (phone studio; no redirect)
curl -sI "$BASE/field"                # 200 text/html (field app; host may canonicalize)
curl -sI "$BASE/sw.js"                # 200 text/javascript, Cache-Control: no-cache
curl -sI "$BASE/manifest.json"        # 200 application/json, Cache-Control: no-cache
curl -sI "$BASE/icons/icon-192.png"   # 200 image/png (must NOT be text/html)
curl -sI "$BASE/assets/$(ls dist/assets | head -1)"  # immutable, long max-age
curl -s "$BASE/manifest.json" | head  # JSON, start_url "/field.html"
```

- [x] `/sw.js` and the icons return their real bytes, not the SPA HTML.
- [x] `Content-Security-Policy` is present and does not block the worker, manifest, fonts,
      or `blob:` media.
- [x] `/field.html` and `/field` render the phone studio; `/#stage=produce` renders the
      desktop workstation; unknown extensionless paths fall back to the desktop SPA.
- [x] On a phone user agent, `$BASE/` returns the field entry (redirect), while
      `$BASE/?surface=desktop` stays on the workstation.
- [!] The host still serves the SPA shell for some missing file paths (for example
      `/nope.png`); the real SW, manifest, icon and asset paths are verified above.

## 5. Phone / PWA acceptance (real device)

Device: Samsung SM-S938U, Android Chrome, 1080×2400 (≈412 CSS px), over HTTPS.

- [x] Open the production URL on the phone; the field studio renders, no desktop graph.
- [x] Capture: grant mic, record, stop; the take appears with duration and analysis.
- [x] Save take; header changes to `1 SAVED · …` with the stored take size.
- [x] Auto chop and even chop (4); audition, merge with next, delete.
- [x] Evolve 8 variants, keep, add to kit.
- [x] Shape sheet: Warm preset, add/remove Noise, live Grit macro, More like this.
- [x] Export `.ncbeat` — saved as `Field_Kit.ncbeat` (no `.zip` suffix), current
      `exportedAt`, manifest/pattern/mixer/2 pads/master stem inside.
- [x] Export `.zip` — `Field-Kit.ncfield.zip` with manifest + WAVs (verified on the
      immediately preceding build; export code unchanged by the final polish).
- [x] Offline reload: service worker serves the field shell, Record button and the
      saved-take library while the network is emulated off; network restored cleanly.
- [x] PWA installability audit on the phone: `manifestErrors: []`,
      `installabilityErrors: []`.
- [x] No horizontal scrolling; header, calibration labels and the shape sheet clear the
      safe areas.
- [x] Install as a home-screen WebAPK and cold-start the installed app — Chrome minted
      WebAPK `org.chromium.webapk.afc259261f8c79874_v2` (“NC Field”); after force-stopping
      Chrome, launching its installed launcher entry reported `display-mode: standalone`,
      the production URL and build `2026-10-28.1`. The installed app has its own Android
      microphone grant: the first Record shows the Chrome permission sheet;
      “Allow while visiting the site” persists.
- [x] Wake lock held during a real take — instrumented `navigator.wakeLock.request`:
      one `screen` request, `held: 1` through a 19.5 s take, `released: 1` on Stop.
- [!] iOS Safari capture/export/offline — not tested; no Apple hardware available.
- [x] Full Lighthouse PWA audit — Lighthouse 11 against production `/field.html`:
      **PWA 100/100**, no run warnings; the three remaining manual audits are
      cross-browser behaviour, page transitions and per-page URLs.
- [x] Deploy an update while the app is installed and confirm the new worker takes over —
      `2026-10-28.1` → `2026-10-28.2` swapped in the already-open standalone app on the
      first poll after `registration.update()`, the saved take survived (still
      `1 SAVED · 3.6 MB`), and an offline reload on the new build served
      `field-BRgl8s4o.js` with the take library intact.
- [x] Phone-only precache verified on the handset — after the `.2 → .3` auto-update on
      cold start, the installed app reported 32 cache entries, 14 fonts,
      `field-BB6YbcQ7.js` present, `App-*.js` absent, `1 SAVED · 3.6 MB` intact, and a
      network-off reload served the field shell at build `2026-10-28.3`.

### Device verification harness

`scripts/phone-cdp.mjs` drives the field tab over Chrome DevTools:

```bash
adb forward tcp:9222 localabstract:chrome_devtools_remote
CDP_TAB_ID=<tab-id> node scripts/phone-cdp.mjs "<expression>"
CDP_TAB_ID=<tab-id> node scripts/phone-cdp.mjs --shot shot.png
CDP_TAB_ID=<tab-id> node scripts/phone-cdp.mjs --pwa
CDP_TAB_ID=<tab-id> node scripts/phone-cdp.mjs --offline
```

Use `--shot` for the field tab only. Plain `adb screencap` captures whatever tab is in
front, which may not be the app.

## 6. Rollback

- Sites: redeploy the previous `dist/` + manifest (both production and preview URLs
  are stable), or unpublish the environment; data, secrets and the URL are retained.
- Vercel: redeploy the previous deployment (or `vercel rollback`). Assets are immutable
  and content-hashed, so a rollback only needs the prior `index.html`/worker.
- Static host: keep the previous `dist/` and restore it.
- No server-side data or migrations are involved; user data stays in the browser.

## 7. Known limitations

- [ ] `[!]` Both Sites environments are public. The production origin is the install
      target; preview remains available for side-by-side checks.
- [ ] `[!]` The workstation's lazy panels are no longer precached (they were what made
      every phone install carry ~1.5 MB of code it cannot use). A desktop opened fully
      offline for the *first* time now loads its shell but not panels it has never
      fetched online; they cache on first online use. The phone app is unaffected.
- [ ] `[!]` Offline verification used CDP network emulation, not airplane mode. It
      exercises the same service-worker cache path but does not test the OS network stack.
- [ ] `[!]` Capture, decoding and playback are verified on Android Chrome only; iOS Safari
      has different download and audio-session behaviour.
- [ ] `[!]` The old anonymous Vercel deployment expired; hosting there now requires an
      account login, and its origin-scoped IndexedDB data cannot be reused at the Sites
      origin.
