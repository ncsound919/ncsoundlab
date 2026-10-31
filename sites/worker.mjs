/**
 * Static host for NC Sound Lab: `dist/` plus the routing and headers that
 * `vercel.json` defines for the web and phone entries.
 *
 * - The host maps `/field.html` to `/field` with a 307 by default. That breaks
 *   the manifest's `/field.html` start URL and the precached navigation entry,
 *   so both HTML entries are served in place (200) by fetching their canonical
 *   asset path internally. `/field` itself already serves the field app.
 * - Unknown extensionless paths fall back to the desktop SPA. Unknown files
 *   keep their real 404 instead of being masked by HTML.
 * - `/ncsound` is a static catalogue under `public/ncsound/`, not an SPA route,
 *   so all three spellings of its URL are pinned to its own index.html.
 */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; font-src 'self'; media-src 'self' blob:; " +
    "connect-src 'self' http://localhost:3050 http://127.0.0.1:3050; " +
    "object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const HTML_ENTRY = new Map([
  ['/index.html', '/'],
  ['/field.html', '/field'],
  // The catalogue is a directory of plain files; every spelling of its URL
  // resolves to its own index.html rather than the desktop SPA fallback.
  ['/ncsound', '/ncsound/'],
  ['/ncsound/', '/ncsound/'],
  ['/ncsound/index.html', '/ncsound/'],
]);

const NO_CACHE_PATHS = new Set([
  '/sw.js',
  '/manifest.json',
  '/index.html',
  '/field.html',
  '/ncsound',
  '/ncsound/',
  '/ncsound/index.html',
  '/ncsound/content.json',
]);

function cachePolicy(pathname) {
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (NO_CACHE_PATHS.has(pathname)) return 'no-cache';
  if (/^\/workbox-[^/]+\.js$/.test(pathname)) return 'no-cache';
  return null;
}

function withHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  const cache = cachePolicy(pathname);
  if (cache) headers.set('Cache-Control', cache);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const entry = HTML_ENTRY.get(url.pathname);
    if (entry) {
      const response = await env.ASSETS.fetch(
        new Request(new URL(`${entry}${url.search}`, url), request),
      );
      return withHeaders(response, url.pathname);
    }

    let response = await env.ASSETS.fetch(request);

    const isNavigation =
      request.method === 'GET' &&
      (request.headers.get('Accept') || '').includes('text/html') &&
      !/\.[a-z0-9]+$/i.test(url.pathname);

    if (response.status === 404 && isNavigation) {
      response = await env.ASSETS.fetch(
        new Request(new URL('/', url), request),
      );
    }

    return withHeaders(response, url.pathname);
  },
};
