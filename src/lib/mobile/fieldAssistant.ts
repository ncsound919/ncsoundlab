/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field Sound Design Assistant — converts language & intent to genome edits.
 *
 * Invariant: The assistant NEVER touches audio directly.
 * It produces constrained parameter edits validated against `GENOME_SCHEMA`
 * via `applyGenomeEdits()`. Every edit is deterministic, bounded, and
 * audibly previewable before being applied.
 *
 * Runs locally on-device without network access.
 */

import {
  applyGenomeEdits,
  describeGenome,
  type Genome,
  type GenomeParams,
  type LayerGene,
} from './genome';
import type { BufferAnalysis } from '../../audio/mobile/analysis';

export interface SoundDesignPreset {
  id: string;
  label: string;
  description: string;
  prompt: string;
  category: 'kick' | 'snare' | 'percussion' | 'lofi' | 'texture' | 'sub';
}

export const SOUND_DESIGN_PRESETS: SoundDesignPreset[] = [
  {
    id: 'punchy-808-kick',
    label: 'Punchy 808 Sub Kick',
    description: 'Injects a 55Hz sub layer, tightens attack with transient lock, lowpasses @ 160Hz with subtle drive.',
    prompt: 'make it a punchy 808 kick with heavy sub bass and warm drive',
    category: 'kick',
  },
  {
    id: 'snappy-clap-snare',
    label: 'Snappy Crack Snare',
    description: 'Blends noise and body layers, highpasses @ 120Hz, bitcrushes for gritty crack.',
    prompt: 'transform into a crisp snappy snare with noise burst and sharp transient',
    category: 'snare',
  },
  {
    id: 'metallic-hihat-click',
    label: 'Metallic Percussion / Hat',
    description: 'Highpasses @ 3500Hz, tightens decay, adds subtle grain scatter for texture.',
    prompt: 'turn into a tight metallic hihat or click with highpass filter',
    category: 'percussion',
  },
  {
    id: 'lofi-sampler-12bit',
    label: 'Lo-Fi Vintage Sampler',
    description: 'Downsamples with 12-bit crunch, lo-hi bandpass (300Hz–4200Hz), and gentle tape saturation.',
    prompt: 'apply gritty 12-bit SP1200 style downsampling and vintage bandpass filter',
    category: 'lofi',
  },
  {
    id: 'sub-layer-infusion',
    label: 'Acoustic Sub Reinforcement',
    description: 'Adds an octave-divided sub sine layer underneath the recording to fill thin low frequencies.',
    prompt: 'add warm sub bass layer underneath the transient to fill low end',
    category: 'sub',
  },
  {
    id: 'ambient-grain-scatter',
    label: 'Granular Ambient Tail',
    description: 'Scatters grains across the tail while locking the transient, adds slow tremolo.',
    prompt: 'add wide granular scatter and subtle tremolo to the tail',
    category: 'texture',
  },
  {
    id: 'cyberpunk-slam',
    label: 'Cyberpunk Industrial Slam',
    description: 'Massive sci-fi impact: sub-sine thump @ 45Hz, heavy overdrive, and 12-bit downsample crunch.',
    prompt: 'transform into a heavy cyberpunk industrial movie impact with massive sub and drive',
    category: 'kick',
  },
  {
    id: 'haunted-drone',
    label: 'Haunted Warehouse Drone',
    description: 'Deep eerie atmospheric texture: high grain scatter, slow pulsing tremolo, and dark lowpass.',
    prompt: 'create a haunted abandoned warehouse dark eerie drone with slow grain scatter',
    category: 'texture',
  },
  {
    id: 'underwater-sub',
    label: 'Underwater Sub Bubble',
    description: 'Submerged acoustic aesthetic: steep 110Hz lowpass filter with sub reinforcement.',
    prompt: 'make it sound underwater and muffled with deep sub bubble',
    category: 'sub',
  },
  {
    id: 'sci-fi-laser',
    label: 'Sci-Fi Laser Transient',
    description: 'Pitched-up resonant crackle with rapid decay and high-frequency edge.',
    prompt: 'turn into a sharp sci-fi laser zap transient with pitch offset',
    category: 'percussion',
  },
];

export interface AssistantTransformation {
  edits: Partial<GenomeParams>;
  explanation: string;
  matchedKeywords: string[];
}

/**
 * Deterministic rule-based prompt parser that transforms text into GenomeParams edits.
 */
export function interpretSoundDesignPrompt(
  prompt: string,
  currentGenome: Genome,
  analysis?: BufferAnalysis
): AssistantTransformation {
  const text = prompt.toLowerCase();
  const matchedKeywords: string[] = [];
  const edits: Partial<GenomeParams> = {};
  const explanations: string[] = [];

  const existingLayers: LayerGene[] = [...currentGenome.params.layers];

  // 1. Kick / 808 / Sub detection
  if (/\b(kick|808|sub|bass|boom|thump|low\s*end|heavy)\b/.test(text)) {
    matchedKeywords.push('sub-kick');
    const root = analysis && analysis.centroidHz > 80 ? Math.round(analysis.centroidHz / 2) : 55;
    const subLayer: LayerGene = {
      kind: 'sub',
      weight: 0.55,
      freqHz: Math.max(35, Math.min(90, root)),
      decayS: 0.35,
      waveform: 'sine',
    };
    // Replace or add sub layer
    const filtered = existingLayers.filter((l) => l.kind !== 'sub');
    filtered.push(subLayer);
    edits.layers = filtered;

    edits.filter = {
      lowHz: 20,
      highHz: 180,
      type: 'lowpass',
    };
    edits.drive = { amount: 0.35, mix: 0.25 };
    edits.transientLockEnabled = true;
    edits.transientLockMs = 15;
    explanations.push(`Added ${subLayer.freqHz}Hz sub layer and lowpass @ 180Hz.`);
  }

  // 2. Snare / Clap / Crack / Noise
  if (/\b(snare|clap|crack|noise|snap|rim)\b/.test(text)) {
    matchedKeywords.push('snare-crack');
    const noiseLayer: LayerGene = {
      kind: 'noise',
      weight: 0.4,
      decayS: 0.18,
    };
    const bodyLayer: LayerGene = {
      kind: 'body',
      weight: 0.3,
      freqHz: 220,
      decayS: 0.12,
      waveform: 'triangle',
    };
    const filtered = existingLayers.filter((l) => l.kind !== 'noise' && l.kind !== 'body');
    filtered.push(noiseLayer, bodyLayer);
    edits.layers = filtered;

    edits.filter = {
      lowHz: 140,
      highHz: 8000,
      type: 'highpass',
    };
    edits.transientLockEnabled = true;
    edits.transientLockMs = 10;
    explanations.push('Blended noise + 220Hz body layers with highpass filter.');
  }

  // 3. Hihat / Metallic / Click / Top
  if (/\b(hihat|hat|metallic|click|top|shaker|tick)\b/.test(text)) {
    matchedKeywords.push('hihat-top');
    edits.filter = {
      lowHz: 2800,
      highHz: 16000,
      type: 'highpass',
    };
    edits.grain = { scatter: 0.25, sizeMs: 25, rateHz: 20 };
    edits.fadeOutMs = 60;
    explanations.push('Highpassed at 2800Hz with tight decay.');
  }

  // 4. Lo-fi / Bitcrush / Crunch / Vintage
  if (/\b(lofi|lo-fi|crunch|bitcrush|crush|vintage|sp1200|sampler|grit)\b/.test(text)) {
    matchedKeywords.push('lo-fi');
    edits.crush = { bits: 10, downsample: 4 };
    edits.drive = { amount: 0.45, mix: 0.35 };
    edits.filter = {
      lowHz: 250,
      highHz: 4200,
      type: 'lohi',
    };
    explanations.push('Applied 10-bit downsampling and lo-hi bandpass filter.');
  }

  // 5. Ambient / Granular / Scatter / Texture
  if (/\b(ambient|grain|granular|scatter|space|cloud|texture|tail)\b/.test(text)) {
    matchedKeywords.push('granular-texture');
    edits.grain = { scatter: 0.65, sizeMs: 80, rateHz: 16 };
    edits.tremolo = { rateHz: 3.5, depth: 0.3 };
    edits.fadeInMs = 25;
    edits.fadeOutMs = 180;
    edits.transientLockEnabled = true;
    edits.transientLockMs = 20;
    explanations.push('Enabled 65% granular scatter with transient preservation.');
  }

  // 6. Cyberpunk / Industrial Slam / Impact
  if (/\b(cyberpunk|industrial|slam|impact|blast|movie)\b/.test(text)) {
    matchedKeywords.push('cyberpunk-slam');
    const subLayer: LayerGene = {
      kind: 'sub',
      weight: 0.65,
      freqHz: 45,
      decayS: 0.45,
      waveform: 'sine',
    };
    const bodyLayer: LayerGene = {
      kind: 'body',
      weight: 0.35,
      freqHz: 110,
      decayS: 0.25,
      waveform: 'saw',
    };
    const filtered = existingLayers.filter((l) => l.kind !== 'sub' && l.kind !== 'body');
    filtered.push(subLayer, bodyLayer);
    edits.layers = filtered;

    edits.filter = { lowHz: 30, highHz: 450, type: 'lowpass' };
    edits.drive = { amount: 0.6, mix: 0.45 };
    edits.crush = { bits: 12, downsample: 2 };
    edits.transientLockEnabled = true;
    edits.transientLockMs = 18;
    explanations.push('Configured massive 45Hz sub thump, heavy overdrive, and 12-bit crunch.');
  }

  // 7. Underwater / Submerged / Muffled
  if (/\b(underwater|muffled|submerged|bubble|deep\s*water)\b/.test(text)) {
    matchedKeywords.push('underwater-sub');
    edits.filter = { lowHz: 20, highHz: 120, type: 'lowpass' };
    const subLayer: LayerGene = {
      kind: 'sub',
      weight: 0.4,
      freqHz: 50,
      decayS: 0.3,
      waveform: 'sine',
    };
    const filtered = existingLayers.filter((l) => l.kind !== 'sub');
    filtered.push(subLayer);
    edits.layers = filtered;
    edits.fadeInMs = 15;
    explanations.push('Applied steep 120Hz lowpass filter with warm 50Hz sub sine.');
  }

  // 8. Haunted / Eerie / Dark Drone / Warehouse
  if (/\b(haunted|eerie|drone|ghost|warehouse|creepy)\b/.test(text)) {
    matchedKeywords.push('haunted-drone');
    edits.grain = { scatter: 0.8, sizeMs: 120, rateHz: 8 };
    edits.tremolo = { rateHz: 1.5, depth: 0.45 };
    edits.filter = { lowHz: 80, highHz: 1600, type: 'lohi' };
    edits.fadeInMs = 40;
    edits.fadeOutMs = 250;
    explanations.push('Created dark atmospheric drone with wide granular scatter and slow tremolo.');
  }

  // 9. Laser / Sci-fi Zap / Pitch dive
  if (/\b(laser|zap|sci-fi|scifi|pew|dive)\b/.test(text)) {
    matchedKeywords.push('sci-fi-laser');
    edits.pitch = { ...currentGenome.params.pitch, offsetCents: 600 };
    edits.filter = { lowHz: 800, highHz: 12000, type: 'bandpass' };
    edits.drive = { amount: 0.35, mix: 0.3 };
    edits.fadeOutMs = 45;
    explanations.push('Transformed into resonant high-frequency sci-fi zap with pitch offset.');
  }

  // 10. Pitch up / down
  if (/\b(pitch\s*up|higher|tune\s*up)\b/.test(text)) {
    matchedKeywords.push('pitch-up');
    const currentCents = currentGenome.params.pitch.offsetCents;
    edits.pitch = { ...currentGenome.params.pitch, offsetCents: Math.min(1200, currentCents + 300) };
    explanations.push('Pitched up +300 cents.');
  } else if (/\b(pitch\s*down|lower|tune\s*down|drop)\b/.test(text)) {
    matchedKeywords.push('pitch-down');
    const currentCents = currentGenome.params.pitch.offsetCents;
    edits.pitch = { ...currentGenome.params.pitch, offsetCents: Math.max(-1200, currentCents - 300) };
    explanations.push('Pitched down -300 cents.');
  }

  // Default fallback if no specific keywords matched
  if (matchedKeywords.length === 0) {
    edits.drive = { amount: 0.25, mix: 0.2 };
    edits.transientLockEnabled = true;
    edits.transientLockMs = 12;
    explanations.push('Applied subtle warmth drive while locking initial transient attack.');
  }

  return {
    edits,
    explanation: explanations.join(' '),
    matchedKeywords,
  };
}

/**
 * Execute the assistant: turns a prompt into an updated Genome, guaranteed to
 * pass all validation and boundary constraints.
 */
export function applyAssistantPrompt(
  prompt: string,
  genome: Genome,
  analysis?: BufferAnalysis
): { updatedGenome: Genome; explanation: string; summary: string } {
  const result = interpretSoundDesignPrompt(prompt, genome, analysis);
  const updatedGenome = applyGenomeEdits(genome, result.edits);
  return {
    updatedGenome,
    explanation: result.explanation,
    summary: describeGenome(updatedGenome),
  };
}
