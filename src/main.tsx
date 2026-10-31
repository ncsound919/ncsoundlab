import { StrictMode, Suspense, lazy, useEffect, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';

/**
 * Desktop entry (`index.html`).
 *
 * The phone field studio has its own HTML entry (`field.html` → `src/field.tsx`)
 * so the two surfaces cannot drag each other's module graph in. This entry only
 * ever renders the workstation; it redirects to the field entry when:
 *
 *   - the URL still uses the old `#/field` bookmark, or
 *   - the visitor is on a phone and did not explicitly ask for the studio.
 *
 * Escape hatches for a phone that wants the full workstation: `#/studio` or
 * `?surface=desktop`. The Tauri desktop shell never redirects.
 */
const App = lazy(() => import('./App.tsx'));

function fieldEntryUrl(): string {
  return new URL('field.html', window.location.href).toString();
}

function shouldOpenField(): boolean {
  if (typeof window === 'undefined') return false;

  // The desktop app is always the desktop surface, even in a narrow window.
  if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get('surface') === 'desktop') return false;
  if (window.location.hash.startsWith('#/studio')) return false;

  // Old bookmarks / links from before the split.
  if (window.location.hash.startsWith('#/field')) return true;

  const ua = navigator.userAgent;
  const phoneUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const touchSmall =
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(max-width: 767px)').matches;

  return phoneUa || touchSmall;
}

const openField = shouldOpenField();
if (openField) {
  window.location.replace(fieldEntryUrl());
}

/** Matches the app background so the chunk fetch never flashes white. */
function LoadingSurface(): ReactElement {
  return (
    <div className="grid min-h-screen place-items-center bg-black">
      <span className="text-[11px] uppercase tracking-[0.3em] text-white/40">Loading…</span>
    </div>
  );
}

function Root() {
  useEffect(() => {
    document.title = 'NC TAR HEEL SOUND LAB | Beatmaker & Audio Engine';

    if (
      !import.meta.env.PROD ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }
    // Workbox-generated worker (vite.config.ts). Both pages share one worker and
    // one update lifecycle, but the precache is phone-first: workstation-only
    // lazy chunks are excluded from it and cached at runtime on first use, so
    // installing NC Field never downloads the desktop panels.
    registerSW({ immediate: true });
  }, []);

  return (
    <Suspense fallback={<LoadingSurface />}>
      <App />
    </Suspense>
  );
}

if (!openField) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
