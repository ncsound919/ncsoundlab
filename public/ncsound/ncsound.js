/**
 * NC Sound catalogue renderer.
 *
 * Everything on the page comes from ./content.json so the catalogue can be
 * updated without touching markup or rebuilding. No framework, no inline
 * script (the host sends `script-src 'self'`), no third-party requests.
 *
 * Nodes are built with createElement/textContent, never innerHTML, so a stray
 * character in a catalogue entry cannot become markup.
 */

const STATUS_ORDER = ['live', 'beta', 'alpha', 'soon'];

const STATUS_LABEL = {
  live: 'Live',
  beta: 'Beta',
  alpha: 'Alpha',
  soon: 'In build',
};

const STATUS_RANK = new Map(STATUS_ORDER.map((s, i) => [s, i]));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function statusTag(status) {
  const key = STATUS_LABEL[status] ? status : 'soon';
  return el('span', `tag tag-${key}`, STATUS_LABEL[key]);
}

function renderApps(apps, filter) {
  const grid = document.getElementById('app-grid');
  grid.replaceChildren();

  const shown = apps
    .filter((app) => filter === 'all' || app.kind === filter)
    .sort(
      (a, b) =>
        (STATUS_RANK.get(a.status) ?? 9) - (STATUS_RANK.get(b.status) ?? 9) ||
        a.name.localeCompare(b.name),
    );

  if (!shown.length) {
    grid.append(el('p', 'empty', 'Nothing in this category yet.'));
    return;
  }

  for (const app of shown) {
    const card = el('article', 'card');

    const top = el('div', 'card-top');
    const heading = el('div');
    const title = el('h3', 'card-title', app.name);
    if (app.sub) title.append(el('span', 'card-sub', app.sub));
    heading.append(title);
    top.append(heading, statusTag(app.status));

    card.append(top);
    card.append(el('p', 'card-blurb', app.blurb));

    const meta = el('div', 'card-meta');
    meta.append(el('span', null, app.kind));
    meta.append(el('span', 'sep', '·'), el('span', null, app.platform));
    card.append(meta);

    const link = el('a', 'card-link', `${app.cta || 'Open'} →`);
    if (app.url) {
      link.href = app.url;
      link.rel = 'noopener';
      if (!app.url.startsWith(location.origin)) link.target = '_blank';
    } else {
      link.setAttribute('aria-disabled', 'true');
      link.removeAttribute('href');
    }
    card.append(link);

    grid.append(card);
  }
}

function renderFilters(apps) {
  const box = document.getElementById('app-filters');
  box.replaceChildren();

  const kinds = ['all', ...new Set(apps.map((a) => a.kind).filter(Boolean))];

  for (const kind of kinds) {
    const chip = el('button', 'chip', kind === 'all' ? `All (${apps.length})` : kind);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', kind === 'all' ? 'true' : 'false');
    chip.addEventListener('click', () => {
      for (const other of box.children) other.setAttribute('aria-pressed', 'false');
      chip.setAttribute('aria-pressed', 'true');
      renderApps(apps, kind);
    });
    box.append(chip);
  }
}

function renderKits(kits) {
  const grid = document.getElementById('kit-grid');
  grid.replaceChildren();

  if (!kits.length) {
    grid.append(el('p', 'empty', 'Kits land here when the first pack is mastered.'));
    return;
  }

  for (const kit of kits) {
    const card = el('article', 'kit');
    card.append(el('h3', null, kit.name));
    card.append(el('p', null, kit.detail));

    if (kit.tags?.length) {
      const tags = el('div', 'kit-tags');
      for (const tag of kit.tags) tags.append(el('span', 'kit-tag', tag));
      card.append(tags);
    }
    if (kit.status && kit.status !== 'live') {
      card.append(statusTag(kit.status));
    }
    grid.append(card);
  }
}

function emptyState(title, body, hint) {
  const box = el('div', 'empty');
  box.append(el('h3', null, title));
  const p = el('p', null, body);
  if (hint) {
    p.append(' ');
    p.append(el('code', null, hint));
  }
  box.append(p);
  return box;
}

function renderReleases(albums) {
  const grid = document.getElementById('album-grid');
  grid.replaceChildren();

  if (!albums.length) {
    grid.append(
      emptyState(
        'No releases yet',
        'The first album opens the catalogue. Entries are plain JSON in',
        'content.json → albums',
      ),
    );
    return;
  }

  for (const album of albums) {
    const card = el('article', 'release');
    const art = el('div', 'release-art');
    if (album.art) {
      const img = el('img');
      img.src = album.art;
      img.alt = `${album.title} cover art`;
      img.loading = 'lazy';
      art.append(img);
    } else {
      art.textContent = 'NC';
    }
    card.append(art);

    const body = el('div', 'release-body');
    body.append(el('h3', null, album.title));
    body.append(el('p', null, [album.year, album.kind].filter(Boolean).join(' · ')));
    if (album.blurb) body.append(el('p', null, album.blurb));

    if (album.url) {
      const link = el('a', 'card-link', 'Listen →');
      link.href = album.url;
      link.rel = 'noopener';
      body.append(link);
    }
    card.append(body);
    grid.append(card);
  }
}

function renderMedia(media) {
  const grid = document.getElementById('media-grid');
  grid.replaceChildren();

  if (!media.length) {
    grid.append(
      emptyState(
        'No media yet',
        'Session footage and walkthroughs appear here once they are cut. Add entries under',
        'content.json → media',
      ),
    );
    return;
  }

  for (const item of media) {
    const card = el('article', 'card');
    card.append(el('h3', 'card-title', item.title));
    if (item.blurb) card.append(el('p', 'card-blurb', item.blurb));
    if (item.url) {
      const link = el('a', 'card-link', 'Watch →');
      link.href = item.url;
      link.rel = 'noopener';
      link.target = '_blank';
      card.append(link);
    }
    grid.append(card);
  }
}

function renderFooter(links, note) {
  const box = document.getElementById('foot-links');
  box.replaceChildren();
  for (const link of links ?? []) {
    const a = el('a', null, link.label);
    a.href = link.url;
    a.rel = 'noopener';
    box.append(a);
  }
  if (note) document.getElementById('foot-note').textContent = note;
}

function wireMenu() {
  const btn = document.getElementById('menu-btn');
  const nav = document.getElementById('nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', () => {
    const open = nav.dataset.open === 'true';
    nav.dataset.open = String(!open);
    btn.setAttribute('aria-expanded', String(!open));
  });

  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      nav.dataset.open = 'false';
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

async function boot() {
  wireMenu();

  let content;
  try {
    const response = await fetch('./content.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`content.json → ${response.status}`);
    content = await response.json();
  } catch (error) {
    const grid = document.getElementById('app-grid');
    grid.replaceChildren(
      emptyState(
        'Catalogue unavailable',
        'content.json could not be loaded. If you opened this file directly, serve the folder over HTTP instead.',
        'python -m http.server',
      ),
    );
    console.error('[ncsound]', error);
    return;
  }

  const apps = content.apps ?? [];
  document.getElementById('stat-apps').textContent = String(apps.length);

  renderFilters(apps);
  renderApps(apps, 'all');
  renderKits(content.kits ?? []);
  renderReleases(content.albums ?? []);
  renderMedia(content.media ?? []);
  renderFooter(content.links, content.brand?.tagline);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
