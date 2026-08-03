# Deployment Readiness Plan — NC Sound Lab

**Objective:** Raise the project from 58% to 90%+ deployment readiness by adding CI/CD, containerization, security headers, SPA fallback, self-hosted assets, and deployment documentation.

**Mode:** Direct (no git repo detected — no branch/PR workflow).

---

## Step 1: Fix broken `server.js` reference in `npm run clean`

**Context:** The `clean` script in `package.json` tries to remove `server.js` which does not exist and never did. This is a leftover from a planned server that was never implemented. It causes a noisy non-error but should be cleaned up.

**Tasks:**
- Remove `server.js` from the `clean` script in `package.json`
- Verify `npm run clean` runs without errors

**Verification:**
```
npm run clean
```
Exit criteria: Command completes with exit code 0, no errors about missing files.

**Rollback:** Revert the `clean` script line in `package.json`.

---

## Step 2: Self-host fonts — eliminate Google Fonts CDN dependency

**Context:** `index.html` loads 7 font families from `fonts.googleapis.com` and `fonts.gstatic.com`. If the CDN is blocked, slow, or unavailable, the app renders in fallback fonts. All font files already exist locally at `public/fonts/fast-blaze.otf`.

**Tasks:**
- Download all Google Fonts referenced in `index.html` (Bebas Neue, Black Ops One, Chakra Petch, Fugaz One, Outfit, Righteous, Racing Sans One, Faster One) as WOFF2 files into `public/fonts/`
- Replace the `<link>` Google Fonts URL in `index.html` with `@font-face` declarations in `src/index.css` pointing to local `public/fonts/` files
- Remove the Google Fonts `<link>` tags from `index.html`
- Verify `npm run build` succeeds and fonts are bundled in `dist/`
- Verify `npm run preview` shows correct fonts

**Verification:**
```
npm run build
npm run preview
```
Exit criteria: Build succeeds, fonts load correctly in preview, no external font requests in network tab.

**Rollback:** Revert `index.html` and `src/index.css` to original Google Fonts `<link>` tags.

---

## Step 3: Create `404.html` for SPA fallback routing

**Context:** When deployed to a static host (GitHub Pages, Netlify, Vercel, S3), deep links like `/studio` return 404 because the server doesn't know about client-side routes. A `404.html` that redirects to `index.html` solves this.

**Tasks:**
- Create `public/404.html` with a script that redirects to `/` (or `index.html`) preserving the original path
- Test that the redirect works correctly

**Verification:**
```
npm run build
```
Exit criteria: `dist/404.html` exists and contains the redirect script.

**Rollback:** Delete `public/404.html`.

---

## Step 4: Add `robots.txt` and PWA `manifest.json`

**Context:** The project has no `robots.txt` (SEO concern for public hosting) and no PWA manifest (not installable, no offline caching).

**Tasks:**
- Create `public/robots.txt` allowing all crawlers (the app is a local-first tool, no sensitive content)
- Create `public/manifest.json` with app name, icons, theme color, display mode, and scope
- Add `<link rel="manifest" href="/manifest.json">` to `index.html`
- Add theme-color meta tag to `index.html`

**Verification:**
```
npm run build
```
Exit criteria: `dist/robots.txt`, `dist/manifest.json`, and manifest `<link>` in `dist/index.html` all present.

**Rollback:** Remove the added files and `<link>` tag from `index.html`.

---

## Step 5: Add security headers configuration

**Context:** No CSP, HSTS, X-Frame-Options, or X-Content-Type-Options headers are configured. The app loads external resources (fonts, already fixed in Step 2) and uses inline styles via Tailwind.

**Tasks:**
- Create `.headers` file (nginx-style) with recommended security headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'`
- Create a `nginx.conf` snippet that applies these headers to static file serving
- Note: CSP may need `unsafe-inline` for Tailwind's inline styles — document any exceptions

**Verification:**
```
cat .headers
cat nginx.conf
```
Exit criteria: Both files exist with correct header directives.

**Rollback:** Delete `.headers` and `nginx.conf`.

---

## Step 6: Create `Dockerfile` for containerized deployment

**Context:** No containerization exists. A Dockerfile enables consistent deployment to any container platform (Docker Hub, ECS, Fly.io, Railway, etc.).

**Tasks:**
- Create a multi-stage `Dockerfile`:
  - Stage 1: `node:24-alpine` — install deps, run `npm run build`
  - Stage 2: `nginx:alpine` — copy `dist/` into nginx html dir, copy `nginx.conf` from Step 5
- Create `.dockerignore` (exclude `node_modules`, `dist`, `.git`, `e2e`, `playwright-report`, `test-results`)
- Verify `docker build` succeeds

**Verification:**
```
docker build -t nc-soundlab .
docker run --rm -p 8080:80 nc-soundlab
curl http://localhost:8080
```
Exit criteria: Build succeeds, container serves the app on port 8080.

**Rollback:** Delete `Dockerfile` and `.dockerignore`.

---

## Step 7: Create CI/CD pipeline (GitHub Actions)

**Context:** No automated pipeline exists. A CI workflow ensures every push is linted, tested, and built before deployment.

**Tasks:**
- Create `.github/workflows/ci.yml` with:
  - Trigger on push and PR to `main`
  - Jobs: `lint` (tsc --noEmit), `test` (vitest run with `CONSTRAINED_ENV=1` to skip the OOM-sensitive test), `build` (npm run build)
  - Cache `node_modules` for speed
  - Upload `dist/` as an artifact
- Note: Since the repo is not currently a git repo, this step assumes git initialization happens first

**Verification:**
```
gh workflow list
```
Exit criteria: Workflow file exists and is valid YAML.

**Rollback:** Delete `.github/workflows/ci.yml`.

---

## Step 8: Add deployment documentation to README

**Context:** The README has a "Quick start" section but no deployment instructions. Users need to know how to deploy to at least one platform.

**Tasks:**
- Add a "Deployment" section to `README.md` with instructions for:
  - **Docker** (primary — most universal)
  - **Static hosting** (GitHub Pages, Netlify, Vercel, S3/CloudFront)
  - **Fly.io / Railway** (if Dockerfile is used)
- Include the security headers note and CDN-free font note

**Verification:**
```
grep -c "Deployment" README.md
```
Exit criteria: README contains a "Deployment" section with at least 2 platform options.

**Rollback:** Remove the Deployment section from README.md.

---

## Step 9: Bundle size optimization

**Context:** `index-C3FPsXk7.js` is 639KB (195KB gzipped). The build warns about chunks >500KB. The main bundle should be split further.

**Tasks:**
- Analyze bundle with `npm run build -- --report` or `rollup-plugin-visualizer`
- Identify largest imports in the main chunk
- Add `manualChunks` entries for heavy libraries (e.g., `three` if used, `wavesurfer`, `jszip`, `bravoh-loudness`)
- Consider lazy-loading non-critical components (StudioSequencer, ThreeDSoundSpace, etc.) with `React.lazy` + `Suspense`
- Re-run build and verify chunk sizes are under 250KB each

**Verification:**
```
npm run build
```
Exit criteria: No chunk exceeds 250KB (gzip), build succeeds.

**Rollback:** Revert `vite.config.ts` manualChunks and any lazy-loading changes.

---

## Dependency Graph

```
Step 1 (clean script)     ── independent ──┐
Step 2 (self-host fonts)  ── independent ──┤
Step 3 (404.html)         ── independent ──┤
Step 4 (robots.txt +      ── independent ──┤
  manifest.json)          ── independent ──┤
Step 5 (security headers) ── independent ──┤
Step 6 (Dockerfile)       ── depends on: Step 5 ──┐
Step 7 (CI/CD)            ── depends on: Step 6 ──┤
Step 8 (README deploy)    ── depends on: Step 6 ──┤
Step 9 (bundle opt)       ── independent ──┘
```

**Parallelizable:** Steps 1–5, 9 can all run in parallel. Steps 6–8 are serial (6 → 7, 6 → 8).

---

## Target Scores After Completion

| Area | Before | Target |
|------|--------|--------|
| Build & Code Quality | 18/20 | 20/20 |
| Deployment Infrastructure | 2/15 | 14/15 |
| Production Readiness | 17/25 | 23/25 |
| Documentation | 8/15 | 14/15 |
| Environment Config | 10/15 | 14/15 |
| **Total** | **55/100** | **85/100** |
