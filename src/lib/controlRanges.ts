/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Canonical control ranges (Phase 2.1).
 *
 * Before this module the same parameter was clamped to different ranges in
 * different places, so the app disagreed with itself:
 *
 *   - BPM: header/tap tempo allowed 40..240, the command palette and the MIDI
 *     controller capped at 60..200, tempo detection allowed 40..300, and
 *     Recourse imports allowed 30..300.
 *   - Swing: the pattern store stores a 0..0.66 fraction while the controller
 *     and pad UI speak 0..75 percent, with `/100` and `*100` scattered around.
 *
 * Every *control surface and validator* now clamps to the constants below, so a
 * value accepted at one entry point is accepted everywhere. The persisted
 * stores deliberately keep a slightly wider tolerance (`patternStore.setBpm` is
 * 30..300, tempo points 20..300) so older project files and external payloads
 * are not silently rewritten on load — the control range is what the UI emits,
 * the store range is only a guard against nonsense.
 */

/** Canonical musical tempo range, shared by every control surface. */
export const BPM_MIN = 60;
export const BPM_MAX = 240;

/** Clamp a BPM to the canonical range. Non-finite input falls back to 120. */
export const clampBpm = (value: number): number => {
  const v = Number.isFinite(value) ? value : 120;
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(v)));
};

/**
 * Swing is stored as a fraction of a step (`patternStore`), but surfaces speak
 * percent. These are the only conversions between the two.
 */
export const SWING_MAX_FRACTION = 0.66;
export const SWING_MAX_PERCENT = 75;

export const clampSwingFraction = (fraction: number): number => {
  const v = Number.isFinite(fraction) ? fraction : 0;
  return Math.max(0, Math.min(SWING_MAX_FRACTION, v));
};

export const clampSwingPercent = (percent: number): number => {
  const v = Number.isFinite(percent) ? percent : 0;
  return Math.max(0, Math.min(SWING_MAX_PERCENT, Math.round(v)));
};

/** Percent (0..75) → stored fraction (0..0.66). */
export const swingPercentToFraction = (percent: number): number =>
  clampSwingFraction(percent / 100);

/** Stored fraction (0..0.66) → percent (0..75). */
export const swingFractionToPercent = (fraction: number): number =>
  clampSwingPercent(fraction * 100);
