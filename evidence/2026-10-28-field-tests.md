# Field verification run — 2026-10-28

Environment: Windows 11, Node, Vite/Vitest, constrained mode.

Commands:

```bash
cd ncsoundlab-main
CONSTRAINED_ENV=1 npx vitest run --reporter=dot
npx tsc --noEmit
npx vite build
```

Results:

```text
Test Files  241 passed (241)
Tests       2795 passed (2795)
Duration    ~5.5 minutes
```

- `tsc --noEmit`: no diagnostics.
- `vite build`: green, 10.8s, precache 49 entries.
- `/ncsound` rendered in the preview with 11 apps and 6 kit families, no console
  or network errors and no horizontal overflow at 390px.

Limitations: this is a web/PWA suite, not a packaged desktop build. No audio
device was measured, and the phone capture path was not exercised in this run.
