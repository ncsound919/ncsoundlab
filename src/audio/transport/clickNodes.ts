import * as Tone from 'tone';

/**
 * Synthesized click. MembraneSynth for the downbeat accent
 * (pitched, ~C5 fundamental) and NoiseSynth for the off-beat tick.
 * Both routed into a single Tone Gain node (the metronome host
 * connects that output to audioEngine.getMasterRackInput()).
 */
export function createClickNodes(): {
  accent: Tone.MembraneSynth;
  tick: Tone.NoiseSynth;
  out: Tone.Gain;
} {
  const accent = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
  });
  const tick = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
  });
  const out = new Tone.Gain(0.5);
  accent.connect(out);
  tick.connect(out);
  return { accent, tick, out };
}
