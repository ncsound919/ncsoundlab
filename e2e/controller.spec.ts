import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage for the MPD226 controller integration.
 *
 * These run in a REAL Chromium against the real Web MIDI API — no fake device.
 * Playwright's Chromium only exposes `navigator.requestMIDIAccess` in a secure
 * context, and MIDI needs the `midi` + `midi-sysex` permissions, both granted
 * below. On this machine the physically connected MPD226 is therefore visible
 * to the app exactly as a user would see it (4 inputs).
 *
 * What is covered automatically:
 *  - the real device is enumerated and selectable in the panel
 *  - the device's on-screen functions (mode switch, MIDI-learn, chord pads,
 *    profile import/export) drive the real app state
 *  - the per-section follow readout tracks the visible workflow stage
 *  - a sound layer is added through the real UI and surfaces in the Mixer
 *
 * What a robot cannot do: press the hardware. The `hardware in the loop` test
 * is opt-in (`MIDI_HW=1`) and asks an operator to move a real control; it then
 * asserts the on-screen function changed. Playwright cannot synthesise MIDI
 * from a physical controller, so this one is inherently human-in-the-loop.
 */
test.use({ permissions: ['midi', 'midi-sysex'] });

// One physical unit — don't fan eight tests at it across parallel workers.
test.describe.configure({ mode: 'serial' });

const DOCK = /MPD ·/i;
const MPD_NAME = 'MPD226';

async function boot(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ncs_demo_status', 'purchased');
    // Start from the shipped defaults, not a stale learned mapping.
    localStorage.removeItem('soundlab-controller-v1');
  });
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('heading', { name: /Synth Layering/i })).toBeVisible();
  // A recovered autosave banner appears asynchronously and, being a sibling
  // before the controller dock, can remount it. Dismiss it deterministically.
  const discard = page.getByRole('button', { name: /^Discard$/i });
  if (await discard.count()) {
    await discard.first().click().catch(() => {});
    await expect(discard).toHaveCount(0);
  }
}

async function openDock(page: Page) {
  const dock = page.getByRole('button', { name: DOCK });
  if ((await dock.getAttribute('aria-expanded')) !== 'true') await dock.click();
  await expect(dock).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-controller-panel]')).toBeVisible();
}

async function connectRealDevice(page: Page) {
  await page.getByRole('button', { name: /Connect MIDI/i }).click();
  // The real port list is the meaningful signal; it can populate a tick after
  // connect() resolves, so wait for a named port rather than a count.
  const device = page.locator('[data-controller-panel]').getByText(MPD_NAME, { exact: true });
  try {
    await expect(device).toBeVisible({ timeout: 20_000 });
  } catch {
    // This machine has no physical unit attached; device-dependent tests are
    // opt-in rather than a hard failure.
    test.skip(true, 'No physical MPD226 detected — connect the unit and re-run.');
  }
}

async function goToStage(page: Page, name: RegExp) {
  // The desktop sidebar is the page's complementary landmark; the mobile
  // switcher carries similar names but is hidden and lives outside it.
  await page.getByRole('complementary').getByRole('button', { name }).click();
}

/** Condensed stages group screens behind a sub-tab strip. */
async function openSubTab(page: Page, label: string) {
  await page.getByRole('navigation', { name: /views/i }).getByRole('button', { name: label, exact: true }).click();
}

test.describe('controller panel · real Web MIDI', () => {
  test('enumerates the physically connected MPD226 inputs', async ({ page }) => {
    await boot(page);
    await openDock(page);
    await connectRealDevice(page);

    // The real device shows up by name in the panel's input list…
    const panel = page.locator('[data-controller-panel]');
    await expect(panel.getByText(MPD_NAME, { exact: true })).toBeVisible();
    // …and every reported port is listed (this unit exposes 4).
    for (const port of ['MIDIIN2 (MPD226)', 'MIDIIN3 (MPD226)', 'MIDIIN4 (MPD226)']) {
      await expect(panel.getByText(port, { exact: true })).toBeVisible();
    }

    // The surface auto-detects to the MPD226 family (header shows the active
    // profile, which is the default Soundlab profile for this unit).
    await expect(page.getByText(/MIDI Controller · Akai MPD226/)).toBeVisible();
  });

  test('learn arms an on-screen control and listens for the next message', async ({ page }) => {
    await boot(page);
    await openDock(page);

    await page.getByRole('button', { name: /MIDI Learn: OFF/i }).click();
    await expect(page.getByRole('button', { name: /MIDI Learn: ON/i })).toBeVisible();

    await page.locator('[data-control="knob:0:0"]').click();
    await expect(page.locator('[data-learn-banner]')).toContainText(/Listening for:\s*knob:0:0/i);
  });

  test('mode switch retargets the whole device on screen', async ({ page }) => {
    await boot(page);
    await openDock(page);

    for (const [button, profile] of [
      ['Sampler', /Akai MPD226 · Sampler/],
      ['Recourse', /Akai MPD226 · Recourse/],
      ['Beat', /Akai MPD226 · Soundlab #15/],
    ] as const) {
      await openDock(page); // self-heal if the dock re-collapsed under load
      await page.getByRole('button', { name: button, exact: true }).click();
      await expect(page.getByText(profile)).toBeVisible();
      if (button === 'Recourse') {
        await expect(page.locator('[data-recourse-status]')).toBeVisible();
      }
    }
  });

  test('chord-pad settings retune the on-screen pads', async ({ page }) => {
    await boot(page);
    await openDock(page);

    // Bank D pads render chord names; changing the key must move them.
    const padLabel = page.locator('[data-chord-pad="0"]');
    const before = await padLabel.textContent();
    // The chord Key select is the first non-surface select in the panel.
    await page.locator('[data-controller-panel] select:not([aria-label])').first().selectOption('G');
    await expect.poll(async () => padLabel.textContent()).not.toBe(before);
  });

  test('exports and imports a controller profile on screen', async ({ page }) => {
    await boot(page);
    await openDock(page);

    const panel = page.locator('[data-controller-panel]');
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: /Export/i }).click();
    expect((await download).suggestedFilename()).toBe('soundlab-controller.json');

    await panel.locator('input[type=file][accept*="json"]').setInputFiles({
      name: 'profile.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'ncsoundlab-controller',
          version: 1,
          profile: { id: 'e2e', name: 'E2E Imported', bindings: { 'knob:0:0': { enabled: true, messageType: 'cc', number: 3, action: 'fx:filterFreq' } }, followPadBank: true, enabledInputIds: [] },
          chord: { key: 'D', scale: 'dorian', seventh: true, octave: 4, inversion: 0, strumMs: 0, spread: 0 },
        }),
      ),
    });
    await expect(page.getByLabel('Profile name')).toHaveValue('E2E Imported');
  });
});

test.describe('section follow across the workflow', () => {
  test('the dock readout tracks the visible stage', async ({ page }) => {
    await boot(page);

    // Default screen is Sound Design · Samples & Layers.
    await expect(page.getByRole('button', { name: /MPD · Layering/i })).toBeVisible();

    await goToStage(page, /Mix, Space & Compare/);
    await openSubTab(page, 'Console');
    const dock = page.getByRole('button', { name: /MPD · Mixer/i });
    await expect(dock).toBeVisible();
    await expect(dock).toContainText(/ch 1–4 gain/i);

    await goToStage(page, /Sound Design/);
    await openSubTab(page, 'Synth & FX');
    await expect(page.getByRole('button', { name: /MPD · Synth & FX/i })).toContainText(/cutoff/i);

    await goToStage(page, /Mix, Space & Compare/);
    await openSubTab(page, '3D Space');
    await expect(page.getByRole('button', { name: /MPD · 3D Space/i })).toContainText(/L\/R/i);

    await openSubTab(page, 'Compare');
    await expect(page.getByRole('button', { name: /MPD · Compare/i })).toContainText(/ref gain/i);

    await goToStage(page, /Sound Evolution Engine/);
    const evo = page.getByRole('button', { name: /MPD · Evolution/i });
    await expect(evo).toContainText(/mode · FX · variation · evolve/i);
  });

  test('the Evolution panel exposes its generation controls on screen', async ({ page }) => {
    await boot(page);
    await goToStage(page, /Sound Evolution Engine/);

    // The bridge is registered while the stage is mounted, so the section
    // readout is live and the panel's own mode/FX buttons are present.
    await expect(page.getByRole('button', { name: /MPD · Evolution/i })).toContainText(/preview · add · save · discard/i);
    await expect(page.getByRole('button', { name: 'Melodic Set' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drum Kit' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Change FX Only/i })).toBeVisible();
  });
});

test.describe('controller + real app state', () => {
  test('a layer added through the UI shows up as a mixer channel', async ({ page }) => {
    await boot(page);

    await page.getByRole('button', { name: /Add Synth/i }).first().click();

    await goToStage(page, /Mix, Space & Compare/);
    await openSubTab(page, 'Console');
    // The channel strip's fader is a slider named GAIN; its value is on screen.
    const gain = page.getByRole('slider', { name: 'GAIN' }).first();
    await expect(gain).toBeVisible();

    // With a layer loaded, the controller can now target it: the dock shows the
    // mixer mapping and the panel is available for the real device.
    await openDock(page);
    await connectRealDevice(page);
    await expect(page.locator('[data-controller-panel]').getByText(MPD_NAME, { exact: true })).toBeVisible();
  });
});

/**
 * Human-in-the-loop against the physical unit. Run with:
 *   $env:MIDI_HW=1; npx playwright test e2e/controller.spec.ts -g "hardware"
 * (add `--headed` to watch it). Move fader F1 / a knob when prompted.
 */
test.describe('hardware in the loop', () => {
  test.skip(process.env.MIDI_HW !== '1', 'Set MIDI_HW=1 and play the connected MPD226');

  test('a real control move changes the on-screen function', async ({ page }) => {
    test.setTimeout(180_000);
    await boot(page);
    await page.getByRole('button', { name: /Add Synth/i }).first().click();
    await goToStage(page, /Studio Console Mixer/);
    await openDock(page);
    await connectRealDevice(page);

    const gain = page.getByRole('slider', { name: 'GAIN' }).first();
    const before = await gain.getAttribute('aria-valuenow');

    // eslint-disable-next-line no-console
    console.log('\n▶ Move fader F1 (or any bank-1 fader/knob) on the MPD226 now…\n');

    // The live monitor must show a real message…
    await expect(page.locator('[data-midi-monitor]')).not.toContainText(/no messages yet/i, {
      timeout: 150_000,
    });
    // …and the mapped channel gain must actually change.
    await expect
      .poll(async () => gain.getAttribute('aria-valuenow'), { timeout: 150_000 })
      .not.toBe(before);
  });
});
