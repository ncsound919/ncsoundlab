# Changelog

All entries below describe changes that were actually run, not planned work.
Earlier history was not recorded; this file starts at the first verified baseline.

## 1.1.1 — 2026-11-07 — metering, stability and shared chrome

- **Compare Engine measures instead of guessing.** The correlation/width readout
  was hard-coded (`0.92 / 0.88 / 100`). Each bus is now tapped with a
  `ChannelSplitterNode` and dedicated L/R analysers, on the audible path, and
  reports Pearson correlation plus mid/side width. Mono reads `+1 / 0`; the
  panel shows `—` only when there is no audio context.
- **No feedback scream from a bad rack.** Shimmer plus audible reverb clamps
  `reverb_decay` to `0.88`, and every FX target is hard-clamped before render,
  matching the native engine guard. A hostile plan renders finite audio instead
  of self-oscillating.
- **Note scheduling hardened.** Late callbacks can no longer schedule in the
  past, pan/filter values are clamped, and `resume()` is non-blocking, so a bad
  preset cannot throw on the audio path and kill a note.
- **Meter UI no longer runs at 60 fps.** Layer levels update at ~12 fps and only
  publish when a peak moves more than 0.02, removing sequencer jank while
  playing.
- **One web chrome.** Brand tokens now mirror `studio-ui.v1.json` (midnight,
  cyan, gold, display/body/mono roles), and a new `StudioWaveformPeaks` display
  component shares the Kotlin contract; the touch field editor stays bespoke.
- **Tempo analysis uses aubio** as the first backend (autocorrelation remains
  the fallback), and the capture worklet recorder keeps its pre-roll ring.
- Session export and autosave metadata now read one `APP_VERSION` constant;
  a test fails if it drifts from `package.json`.
- Test environment: Node 26's experimental global `localStorage` is replaced
  with an in-memory implementation when jsdom's storage is swallowed, so the
  suite runs on the current Node as well as CI's Node 24.

## 1.1.0 — 2026-10-28 — verified baseline

- Full unit suite passes in the constrained environment:
  2,795 tests across 241 files, 5.5 minutes.
- `tsc --noEmit` clean and `vite build` green (precache still 49 entries).
- Added the `/ncsound` catalogue route and excluded it from the PWA precache,
  so an installed Field shell does not answer catalogue URLs with the app.
- No audio-engine or desktop-shell behaviour was changed in this entry.

Not covered by this entry: no packaged desktop build was produced and the
record → chop → evolve → export path has not been walked on a phone since this
baseline. See `docs/ecosystem/READINESS.md` §4 for the beta gate.
