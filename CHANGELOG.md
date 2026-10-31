# Changelog

All entries below describe changes that were actually run, not planned work.
Earlier history was not recorded; this file starts at the first verified baseline.

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
