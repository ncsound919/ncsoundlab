/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Deep preset library for the Hex Combinator.
 * Based on real-world sound-design tricks, iconic FX chains, and hardware combos.
 */
import type { CombinatorPreset } from './combinatorPresets';

function S(id: string, moduleId: string, params: Record<string, number>, motion: any, motionParams: any, opts?: any): any {
  return {
    id,
    moduleId,
    enabled: true,
    mix: opts?.mix ?? 1,
    preGainDb: opts?.pre ?? 0,
    postGainDb: opts?.post ?? 0,
    polarity: false,
    bands: opts?.bands ?? { low: true, mid: true, high: true },
    crossovers: opts?.xo ?? [200, 2000],
    params,
    motion,
    motionParams,
    lfoShape: opts?.shape,
    locked: false,
  };
}

function state(slots: any[], bpm = 120, masterMix = 1, xy?: any): any {
  return {
    slots,
    routes: [],
    masterMix,
    bpm,
    tightMode: true,
    xyAssign: xy ?? { x: slots[0]?.id + '.mix', y: slots[0]?.id + '.mix' },
    morphAmount: 0,
  };
}

export const REAL_PRESETS: CombinatorPreset[] = [
  // --- Sidechain / pumping ---
  { id: 'rp-pump-classic', name: 'Classic Sidechain Pump', category: 'Movement', tags: ['sidechain','pump','house'], author: 'NC Sound Lab', theoryNote: 'Quarter-note ducking of bass/pads behind kick; release tuned to tempo for groove.', bpm: 124, state: state([S('s1','SIDECHAIN_DUCK',{threshold:-24,ratio:6,attack:1,release:150}, 'follower',{depth:1,attack:1,release:150,target:'threshold'})]) },
  { id: 'rp-pump-triplet', name: 'Triplet Ghost Pump', category: 'Movement', tags: ['sidechain','triplet','groove'], author: 'NC Sound Lab', theoryNote: 'Sidechain keyed to a muted triplet pattern (ghost track) for off-grid bounce.', bpm: 128, state: state([S('s1','SIDECHAIN_DUCK',{threshold:-20,ratio:8,attack:2,release:100}, 'follower',{depth:1,attack:2,release:100,target:'threshold'})]) },
  { id: 'rp-pump-multiband', name: 'Multiband Pump', category: 'Movement', tags: ['sidechain','multiband','edm'], author: 'NC Sound Lab', theoryNote: 'Duck only low band so highs stay present; avoids muddy pump.', bpm: 126, state: state([S('s1','SIDECHAIN_DUCK',{threshold:-18,ratio:5,attack:3,release:120}, 'follower',{depth:1,attack:3,release:120,target:'threshold'}, {bands:{low:true,mid:false,high:false}})]) },
  { id: 'rp-pump-subtle', name: 'Subtle Mix Pump', category: 'Movement', tags: ['sidechain','subtle','pop'], author: 'NC Sound Lab', theoryNote: 'Low ratio, slow release: glue without obvious pumping.', bpm: 118, state: state([S('s1','SIDECHAIN_DUCK',{threshold:-12,ratio:2,attack:10,release:300}, 'follower',{depth:0.4,attack:10,release:300,target:'threshold'})]) },

  // --- Wobble / LFO bass ---
  { id: 'rp-wobble-dubstep', name: 'Dubstep Wobble', category: 'Bass design', tags: ['wobble','lfo','dubstep'], author: 'NC Sound Lab', theoryNote: 'LFO filter cutoff at 1/8 notes; resonance adds growl.', bpm: 140, state: state([S('s1','LADDER_FILTER',{cutoff:600,resonance:10,drive:3}, 'lfo',{depth:0.9,rateBeats:0.5,shape:'sine',target:'cutoff'}, {shape:{points:[{t:0,v:-1},{t:0.5,v:1},{t:1,v:-1}],interp:'smooth'}})]) },
  { id: 'rp-wobble-skrillex', name: 'Skrillex Growl', category: 'Bass design', tags: ['growl','formant','bass'], author: 'NC Sound Lab', theoryNote: 'Formant-shifted growl via filter + saturation + LFO; vowel-like timbre.', bpm: 140, state: state([S('s1','LADDER_FILTER',{cutoff:900,resonance:12,drive:4}, 'lfo',{depth:0.85,rateBeats:0.25,shape:'sawUp',target:'cutoff'}), S('s2','SATURATION',{drive:12,mix:80}, 'macro',{depth:0.3,macro:0.6})]) },
  { id: 'rp-wobble-reese', name: 'Reese Bass', category: 'Bass design', tags: ['reese','detune','bass'], author: 'NC Sound Lab', theoryNote: 'Detuned saws + slow LFO filter = moving, chorused reese.', bpm: 174, state: state([S('s1','CHORUS_WIDTH',{rate:0.3,depth:60,mix:50}, 'lfo',{depth:0.4,rateBeats:4,shape:'sine',target:'rate'}), S('s2','LADDER_FILTER',{cutoff:1200,resonance:6,drive:2}, 'lfo',{depth:0.5,rateBeats:2,shape:'tri',target:'cutoff'})]) },
  { id: 'rp-wobble-talking', name: 'Talking Bass', category: 'Bass design', tags: ['talkbox','formant','bass'], author: 'NC Sound Lab', theoryNote: 'Bandpass filter swept by LFO mimics talkbox vowel formants.', bpm: 110, state: state([S('s1','LADDER_FILTER',{cutoff:700,resonance:14,drive:2}, 'lfo',{depth:1,rateBeats:1,shape:'sine',target:'cutoff'}, {xo:[300,3000]})]) },

  // --- Glitch / stutter ---
  { id: 'rp-glitch-stutter', name: '1/16 Stutter', category: 'Glitch', tags: ['stutter','glitch','rhythmic'], author: 'NC Sound Lab', theoryNote: 'Hard gate at 1/16 notes creates stutter; tight snap to grid.', bpm: 128, state: state([S('s1','SIDECHAIN_DUCK',{threshold:-60,ratio:100,attack:1,release:10}, 'sequencer',{depth:1,steps:[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],stepsPerBeat:4,glide:0,target:'threshold'})]) },
  { id: 'rp-glitch-half', name: 'Half-Time', category: 'Glitch', tags: ['halftime','slow','transition'], author: 'NC Sound Lab', theoryNote: 'Half-time playback feel via pitch+time; great for drops.', bpm: 128, state: state([S('s1','LADDER_FILTER',{cutoff:4000,resonance:4,drive:0}, 'macro',{depth:0.2,macro:0.5})], 128, 1, {x:'s1.cutoff',y:'s1.cutoff'}) },
  { id: 'rp-glitch-reverse', name: 'Reverse Swell', category: 'Glitch', tags: ['reverse','swell','transition'], author: 'NC Sound Lab', theoryNote: 'Reverse reverb tail + filter open = classic swell into downbeat.', bpm: 120, state: state([S('s1','HALL_REVERB',{mix:0.6,decay:2.5,predelay:0}, 'lfo',{depth:0.6,rateBeats:1,shape:'sawUp',target:'mix'}), S('s2','LADDER_FILTER',{cutoff:2000,resonance:3,drive:0}, 'lfo',{depth:0.7,rateBeats:1,shape:'sawUp',target:'cutoff'})]) },
  { id: 'rp-glitch-granular', name: 'Granular Scatter', category: 'Glitch', tags: ['granular','scatter','texture'], author: 'NC Sound Lab', theoryNote: 'Granular scatter of source; chaos engine mutation.', bpm: 100, state: state([S('s1','LADDER_FILTER',{cutoff:3000,resonance:5,drive:1}, 'lfo',{depth:0.8,rateBeats:8,shape:'randomSH',target:'cutoff'})]) },
  { id: 'rp-glitch-bitcrush', name: 'Bitcrush Glitch', category: 'Glitch', tags: ['bitcrush','lofi','glitch'], author: 'NC Sound Lab', theoryNote: 'Bit reduction + sample hold for digital artifacts.', bpm: 128, state: state([S('s1','SATURATION',{drive:6,mix:100}, 'sequencer',{depth:0.7,steps:[1,1,0,1,0,0,1,0],stepsPerBeat:4,glide:0,target:'drive'})]) },

  // --- Lo-fi / degradation ---
  { id: 'rp-lofi-cassette', name: 'Cassette Tape', category: 'Lo-fi', tags: ['cassette','tape','lofi'], author: 'NC Sound Lab', theoryNote: 'Wow/flutter + hiss + gentle saturation = cassette vibe.', bpm: 90, state: state([S('s1','TAPE_MACHINE',{drive:4,bias:60,wowFlutter:40}, 'lfo',{depth:0.3,rateBeats:0.25,shape:'sine',target:'wowFlutter'})]) },
  { id: 'rp-lofi-vinyl', name: 'Vinyl Crackle', category: 'Lo-fi', tags: ['vinyl','crackle','lofi'], author: 'NC Sound Lab', theoryNote: 'Vinyl sim: noise + wow + compressor for worn record.', bpm: 85, state: state([S('s1','SATURATION',{drive:3,mix:60}, 'macro',{depth:0.2,macro:0.3})]) },
  { id: 'rp-lofi-radio', name: 'AM Radio', category: 'Lo-fi', tags: ['radio','bandpass','lofi'], author: 'NC Sound Lab', theoryNote: 'Bandpass filter + light distortion = radio transmission.', bpm: 100, state: state([S('s1','LADDER_FILTER',{cutoff:1200,resonance:4,drive:2}, 'macro',{depth:0.1,macro:0.5}, {xo:[400,2500]})]) },
  { id: 'rp-lofi-telephone', name: 'Telephone', category: 'Lo-fi', tags: ['telephone','narrow','lofi'], author: 'NC Sound Lab', theoryNote: 'Narrow bandpass ~300-3400Hz for phone effect.', bpm: 100, state: state([S('s1','LADDER_FILTER',{cutoff:1800,resonance:6,drive:1}, 'macro',{depth:0.1,macro:0.5}, {xo:[300,3400]})]) },
  { id: 'rp-lofi-vhs', name: 'VHS Tape', category: 'Lo-fi', tags: ['vhs','tape','retro'], author: 'NC Sound Lab', theoryNote: 'Tape saturation + wow + high-shelf cut for VHS.', bpm: 95, state: state([S('s1','TAPE_MACHINE',{drive:5,bias:50,wowFlutter:25}, 'lfo',{depth:0.25,rateBeats:0.125,shape:'sine',target:'wowFlutter'})]) },

  // --- Space / reverb ---
  { id: 'rp-space-hall', name: 'Cathedral Hall', category: 'Space', tags: ['reverb','hall','huge'], author: 'NC Sound Lab', theoryNote: 'Long hall reverb with slow LFO on mix for breathing space.', bpm: 90, state: state([S('s1','HALL_REVERB',{mix:0.5,decay:4.0,predelay:20}, 'lfo',{depth:0.3,rateBeats:0.5,shape:'sine',target:'mix'})]) },
  { id: 'rp-space-plate', name: 'Plate Reverb', category: 'Space', tags: ['plate','reverb','vocal'], author: 'NC Sound Lab', theoryNote: 'Classic plate: short decay, bright, vocal-friendly.', bpm: 120, state: state([S('s1','PLATE_REVERB',{mix:0.35,decay:1.8,predelay:10}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-space-spring', name: 'Spring Reverb', category: 'Space', tags: ['spring','reverb','guitar'], author: 'NC Sound Lab', theoryNote: 'Spring reverb drip; great on guitars/vocals.', bpm: 110, state: state([S('s1','ROOM_REVERB',{mix:0.4,decay:1.2,predelay:5}, 'macro',{depth:0.15,macro:0.4})]) },
  { id: 'rp-space-gated', name: 'Gated Reverb', category: 'Space', tags: ['gated','80s','drum'], author: 'NC Sound Lab', theoryNote: 'Short gated reverb (80s drum sound); tight release.', bpm: 120, state: state([S('s1','ROOM_REVERB',{mix:0.5,decay:0.6,predelay:0}, 'gate',{depth:1,holdMs:150,target:'mix'})]) },
  { id: 'rp-space-shimmer', name: 'Shimmer Reverb', category: 'Space', tags: ['shimmer','pitch','ambient'], author: 'NC Sound Lab', theoryNote: 'Pitch-shifted reverb tail rising; ethereal.', bpm: 80, state: state([S('s1','HALL_REVERB',{mix:0.55,decay:3.5,predelay:30}, 'lfo',{depth:0.5,rateBeats:2,shape:'sawUp',target:'mix'})]) },
  { id: 'rp-space-inverse', name: 'Inverse Reverb', category: 'Space', tags: ['inverse','reverse','swell'], author: 'NC Sound Lab', theoryNote: 'Reverse reverb swell before the hit.', bpm: 100, state: state([S('s1','HALL_REVERB',{mix:0.6,decay:2.0,predelay:0}, 'lfo',{depth:0.8,rateBeats:1,shape:'sawDown',target:'mix'})]) },

  // --- Delay ---
  { id: 'rp-delay-pingpong', name: 'Ping-Pong Delay', category: 'Movement', tags: ['delay','pingpong','stereo'], author: 'NC Sound Lab', theoryNote: 'Stereo ping-pong echoes; feedback filtered.', bpm: 120, state: state([S('s1','TEMPO_DELAY',{mix:0.4,feedback:0.5,time:375}, 'macro',{depth:0.2,macro:0.5})]) },
  { id: 'rp-delay-tape', name: 'Tape Echo', category: 'Space', tags: ['tape','echo','analog'], author: 'NC Sound Lab', theoryNote: 'Tape delay with wow; degrading repeats.', bpm: 100, state: state([S('s1','TAPE_MACHINE',{drive:3,bias:50,wowFlutter:20}, 'macro',{depth:0.2,macro:0.4}), S('s2','TEMPO_DELAY',{mix:0.35,feedback:0.6,time:420}, 'lfo',{depth:0.2,rateBeats:0.5,shape:'sine',target:'feedback'})]) },
  { id: 'rp-delay-dotted', name: 'Dotted 8th Delay', category: 'Movement', tags: ['delay','dotted','guitar'], author: 'NC Sound Lab', theoryNote: 'Dotted-8th sync delay for rhythmic guitar.', bpm: 120, state: state([S('s1','TEMPO_DELAY',{mix:0.3,feedback:0.45,time:375}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-delay-slap', name: 'Slapback', category: 'Space', tags: ['slapback','rockabilly','vocal'], author: 'NC Sound Lab', theoryNote: 'Short slapback echo for vocals/guitars.', bpm: 100, state: state([S('s1','TEMPO_DELAY',{mix:0.25,feedback:0.1,time:80}, 'macro',{depth:0.1,macro:0.5})]) },

  // --- Modulation ---
  { id: 'rp-mod-chorus', name: 'Lush Chorus', category: 'Modulation', tags: ['chorus','lush','pad'], author: 'NC Sound Lab', theoryNote: 'Slow chorus for width and movement on pads.', bpm: 90, state: state([S('s1','CHORUS_WIDTH',{rate:0.8,depth:50,mix:40}, 'lfo',{depth:0.4,rateBeats:4,shape:'sine',target:'depth'})]) },
  { id: 'rp-mod-flanger', name: 'Jet Flanger', category: 'Modulation', tags: ['flanger','jet','sweep'], author: 'NC Sound Lab', theoryNote: 'Through-zero flanger sweep; classic jet sound.', bpm: 120, state: state([S('s1','CHORUS_WIDTH',{rate:0.3,depth:80,mix:60}, 'lfo',{depth:0.9,rateBeats:2,shape:'sine',target:'rate'})]) },
  { id: 'rp-mod-phaser', name: 'Optical Phaser', category: 'Modulation', tags: ['phaser','sweep','guitar'], author: 'NC Sound Lab', theoryNote: 'Slow phaser sweep for guitar/keys.', bpm: 100, state: state([S('s1','LADDER_FILTER',{cutoff:1500,resonance:4,drive:0}, 'lfo',{depth:0.7,rateBeats:4,shape:'sine',target:'cutoff'})]) },
  { id: 'rp-mod-tremolo', name: 'Vintage Tremolo', category: 'Modulation', tags: ['tremolo','vintage','amp'], author: 'NC Sound Lab', theoryNote: 'Amp tremolo for vintage vibe.', bpm: 90, state: state([S('s1','SATURATION',{drive:2,mix:100}, 'lfo',{depth:0.6,rateBeats:4,shape:'sine',target:'mix'})]) },
  { id: 'rp-mod-inf-flanger', name: 'Infinity Flanger', category: 'Modulation', tags: ['infinity','flanger','endless'], author: 'NC Sound Lab', theoryNote: 'Endless rising flanger; Hex-style.', bpm: 120, state: state([S('s1','CHORUS_WIDTH',{rate:0.1,depth:90,mix:70}, 'lfo',{depth:1,rateBeats:0.5,shape:'sawUp',target:'rate'})]) },

  // --- Saturation / color ---
  { id: 'rp-sat-tape', name: 'Tape Saturation', category: 'Color', tags: ['tape','saturation','warmth'], author: 'NC Sound Lab', theoryNote: 'Tape saturation for warmth and glue.', bpm: 120, state: state([S('s1','TAPE_MACHINE',{drive:4,bias:55,wowFlutter:10}, 'macro',{depth:0.2,macro:0.5})]) },
  { id: 'rp-sat-tube', name: 'Tube Drive', category: 'Color', tags: ['tube','drive','harmonic'], author: 'NC Sound Lab', theoryNote: 'Tube saturation adds even harmonics.', bpm: 120, state: state([S('s1','SATURATION',{drive:8,mix:70}, 'macro',{depth:0.3,macro:0.6})]) },
  { id: 'rp-sat-parallel', name: 'Parallel Distortion', category: 'Color', tags: ['parallel','distortion','heavy'], author: 'NC Sound Lab', theoryNote: 'Parallel distortion for weight without losing clarity.', bpm: 110, state: state([S('s1','SATURATION',{drive:18,mix:40}, 'macro',{depth:0.4,macro:0.7})]) },
  { id: 'rp-sat-bitcrush', name: 'Bitcrush Color', category: 'Color', tags: ['bitcrush','lofi','color'], author: 'NC Sound Lab', theoryNote: 'Light bitcrush for digital texture.', bpm: 120, state: state([S('s1','SATURATION',{drive:2,mix:30}, 'lfo',{depth:0.2,rateBeats:0.25,shape:'randomSH',target:'drive'})]) },

  // --- Dynamics ---
  { id: 'rp-dyn-1176', name: '1176 All-Buttons', category: 'Dynamics', tags: ['1176','allbuttons','drums'], author: 'NC Sound Lab', theoryNote: 'FET comp all-buttons-in for explosive drums.', bpm: 120, state: state([S('s1','FET_1176',{ratio:20,attack:1,release:50}, 'macro',{depth:0.2,macro:0.6})]) },
  { id: 'rp-dyn-la2a', name: 'LA-2A Vocal', category: 'Dynamics', tags: ['la2a','vocal','optical'], author: 'NC Sound Lab', theoryNote: 'Optical compression for smooth vocal leveling.', bpm: 100, state: state([S('s1','OPTO_LA2A',{peakReduction:40,gain:30}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-dyn-glue', name: 'Bus Glue', category: 'Dynamics', tags: ['bus','glue','vca'], author: 'NC Sound Lab', theoryNote: 'VCA bus comp for mix glue.', bpm: 120, state: state([S('s1','VCA_BUS_COMP',{threshold:-10,ratio:2,attack:30,release:100}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-dyn-parallel', name: 'Parallel Comp', category: 'Dynamics', tags: ['parallel','ny','punch'], author: 'NC Sound Lab', theoryNote: 'NY compression: parallel punch.', bpm: 120, state: state([S('s1','PARALLEL_COMP',{threshold:-20,ratio:4,attack:5,release:80,mix:50}, 'macro',{depth:0.2,macro:0.6})]) },
  { id: 'rp-dyn-deess', name: 'De-Esser', category: 'Dynamics', tags: ['deesser','vocal','sibilance'], author: 'NC Sound Lab', theoryNote: 'De-ess sibilance on vocals.', bpm: 100, state: state([S('s1','DE_ESSER',{freq:7000,threshold:-18}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-dyn-limiter', name: 'Brickwall Limiter', category: 'Dynamics', tags: ['limiter','mastering','loud'], author: 'NC Sound Lab', theoryNote: 'True-peak limiter for loudness.', bpm: 120, state: state([S('s1','TRUE_PEAK_LIMITER',{ceiling:-0.3,release:50}, 'macro',{depth:0.1,macro:0.5})]) },

  // --- Vocal chains ---
  { id: 'rp-vocal-polish', name: 'Vocal Polish', category: 'Vocal', tags: ['vocal','polish','chain'], author: 'NC Sound Lab', theoryNote: 'EQ + de-ess + comp + reverb + delay chain.', bpm: 100, state: state([S('s1','SSL_CHANNEL_EQ',{low:2,mid:1,high:2}, 'macro',{depth:0.1,macro:0.5}), S('s2','DE_ESSER',{freq:7000,threshold:-18}, 'macro',{depth:0.1,macro:0.5}), S('s3','OPTO_LA2A',{peakReduction:35,gain:25}, 'macro',{depth:0.1,macro:0.5}), S('s4','PLATE_REVERB',{mix:0.25,decay:1.6,predelay:15}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-vocal-radio', name: 'Radio Vocal', category: 'Vocal', tags: ['radio','vocal','narrow'], author: 'NC Sound Lab', theoryNote: 'Narrow bandpass + comp for radio voice.', bpm: 100, state: state([S('s1','LADDER_FILTER',{cutoff:1800,resonance:5,drive:1}, 'macro',{depth:0.1,macro:0.5}, {xo:[300,3400]}), S('s2','FET_1176',{ratio:8,attack:5,release:80}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-vocal-doubler', name: 'Vocal Doubler', category: 'Vocal', tags: ['doubler','chorus','width'], author: 'NC Sound Lab', theoryNote: 'Chorus doubler for width.', bpm: 100, state: state([S('s1','CHORUS_WIDTH',{rate:0.5,depth:30,mix:30}, 'lfo',{depth:0.3,rateBeats:0.5,shape:'sine',target:'depth'})]) },
  { id: 'rp-vocal-telephone', name: 'Telephone Vocal', category: 'Vocal', tags: ['telephone','vocal','narrow'], author: 'NC Sound Lab', theoryNote: 'Phone-band EQ for lo-fi vocal.', bpm: 100, state: state([S('s1','LADDER_FILTER',{cutoff:1800,resonance:6,drive:1}, 'macro',{depth:0.1,macro:0.5}, {xo:[300,3400]})]) },

  // --- Drum processing ---
  { id: 'rp-drum-transient', name: 'Transient Shaper', category: 'Drums', tags: ['transient','drums','punch'], author: 'NC Sound Lab', theoryNote: 'Transient enhancement for drum punch.', bpm: 120, state: state([S('s1','FET_1176',{ratio:4,attack:1,release:60}, 'macro',{depth:0.2,macro:0.6})]) },
  { id: 'rp-drum-room', name: 'Drum Room', category: 'Drums', tags: ['room','drums','space'], author: 'NC Sound Lab', theoryNote: 'Room reverb for drum ambience.', bpm: 120, state: state([S('s1','ROOM_REVERB',{mix:0.3,decay:0.8,predelay:5}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-drum-parallel', name: 'Parallel Drum Crush', category: 'Drums', tags: ['parallel','crush','drums'], author: 'NC Sound Lab', theoryNote: 'Parallel bitcrush for drum grit.', bpm: 120, state: state([S('s1','SATURATION',{drive:14,mix:35}, 'macro',{depth:0.3,macro:0.6})]) },
  { id: 'rp-drum-gated', name: 'Gated Snare', category: 'Drums', tags: ['gated','snare','80s'], author: 'NC Sound Lab', theoryNote: 'Gated reverb on snare.', bpm: 120, state: state([S('s1','ROOM_REVERB',{mix:0.5,decay:0.4,predelay:0}, 'gate',{depth:1,holdMs:120,target:'mix'})]) },

  // --- Ambient / pads ---
  { id: 'rp-ambient-pad', name: 'Evolving Pad', category: 'Ambient', tags: ['pad','evolving','ambient'], author: 'NC Sound Lab', theoryNote: 'Slow filter + reverb + chorus for evolving pad.', bpm: 80, state: state([S('s1','LADDER_FILTER',{cutoff:2000,resonance:3,drive:0}, 'lfo',{depth:0.6,rateBeats:8,shape:'sine',target:'cutoff'}), S('s2','HALL_REVERB',{mix:0.5,decay:4.0,predelay:30}, 'macro',{depth:0.2,macro:0.5}), S('s3','CHORUS_WIDTH',{rate:0.2,depth:40,mix:30}, 'lfo',{depth:0.3,rateBeats:4,shape:'sine',target:'depth'})]) },
  { id: 'rp-ambient-drone', name: 'Deep Drone', category: 'Ambient', tags: ['drone','deep','ambient'], author: 'NC Sound Lab', theoryNote: 'Low drone with slow LFO filter.', bpm: 60, state: state([S('s1','LADDER_FILTER',{cutoff:400,resonance:8,drive:1}, 'lfo',{depth:0.5,rateBeats:16,shape:'sine',target:'cutoff'})]) },
  { id: 'rp-ambient-shimmer', name: 'Shimmer Pad', category: 'Ambient', tags: ['shimmer','pad','ethereal'], author: 'NC Sound Lab', theoryNote: 'Shimmering pad with pitch reverb.', bpm: 80, state: state([S('s1','HALL_REVERB',{mix:0.6,decay:4.5,predelay:40}, 'lfo',{depth:0.5,rateBeats:2,shape:'sawUp',target:'mix'})]) },
  { id: 'rp-ambient-space', name: 'Outer Space', category: 'Ambient', tags: ['space','ambient','wide'], author: 'NC Sound Lab', theoryNote: 'Wide space with chorus + reverb.', bpm: 70, state: state([S('s1','CHORUS_WIDTH',{rate:0.1,depth:60,mix:40}, 'lfo',{depth:0.4,rateBeats:8,shape:'sine',target:'depth'}), S('s2','HALL_REVERB',{mix:0.6,decay:5.0,predelay:50}, 'macro',{depth:0.2,macro:0.6})]) },

  // --- Transitions ---
  { id: 'rp-trans-build', name: 'Build-Up', category: 'Transitions', tags: ['build','riser','transition'], author: 'NC Sound Lab', theoryNote: 'Filter open + reverb swell for build.', bpm: 128, state: state([S('s1','LADDER_FILTER',{cutoff:500,resonance:6,drive:2}, 'lfo',{depth:1,rateBeats:4,shape:'sawUp',target:'cutoff'}), S('s2','HALL_REVERB',{mix:0.3,decay:2.0,predelay:10}, 'lfo',{depth:0.7,rateBeats:4,shape:'sawUp',target:'mix'})]) },
  { id: 'rp-trans-drop', name: 'Drop Impact', category: 'Transitions', tags: ['drop','impact','transition'], author: 'NC Sound Lab', theoryNote: 'Low boost + saturation for drop.', bpm: 128, state: state([S('s1','SATURATION',{drive:10,mix:60}, 'macro',{depth:0.4,macro:0.8}), S('s2','LADDER_FILTER',{cutoff:8000,resonance:2,drive:0}, 'macro',{depth:0.3,macro:0.7})]) },
  { id: 'rp-trans-sweep', name: 'Filter Sweep', category: 'Transitions', tags: ['sweep','filter','transition'], author: 'NC Sound Lab', theoryNote: 'Classic filter sweep.', bpm: 120, state: state([S('s1','LADDER_FILTER',{cutoff:200,resonance:8,drive:1}, 'lfo',{depth:1,rateBeats:2,shape:'sawUp',target:'cutoff'})]) },
  { id: 'rp-trans-riser', name: 'Noise Riser', category: 'Transitions', tags: ['riser','noise','transition'], author: 'NC Sound Lab', theoryNote: 'Rising noise + filter.', bpm: 128, state: state([S('s1','LADDER_FILTER',{cutoff:1000,resonance:4,drive:0}, 'lfo',{depth:1,rateBeats:4,shape:'sawUp',target:'cutoff'})]) },

  // --- EQ tricks ---
  { id: 'rp-eq-smiley', name: 'Smiley EQ', category: 'EQ', tags: ['eq','smiley','hype'], author: 'NC Sound Lab', theoryNote: 'Low+high boost, mid cut for hype.', bpm: 120, state: state([S('s1','SSL_CHANNEL_EQ',{low:4,mid:-3,high:4}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-eq-vocal', name: 'Vocal EQ', category: 'EQ', tags: ['eq','vocal','presence'], author: 'NC Sound Lab', theoryNote: 'Presence boost + low cut for vocals.', bpm: 100, state: state([S('s1','NEVE_1073',{low:2,mid:3,high:2}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-eq-bass', name: 'Bass EQ', category: 'EQ', tags: ['eq','bass','low'], author: 'NC Sound Lab', theoryNote: 'Low boost + high cut for bass.', bpm: 120, state: state([S('s1','PULTEC_EQP1A',{low:4,high:-2}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-eq-air', name: 'Air Band', category: 'EQ', tags: ['eq','air','high'], author: 'NC Sound Lab', theoryNote: 'High-shelf boost for air.', bpm: 120, state: state([S('s1','AIR_SHELF',{freq:12000,gain:4}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-eq-midscoop', name: 'Mid Scoop', category: 'EQ', tags: ['eq','scoop','metal'], author: 'NC Sound Lab', theoryNote: 'Mid scoop for metal guitars.', bpm: 140, state: state([S('s1','SSL_CHANNEL_EQ',{low:2,mid:-6,high:3}, 'macro',{depth:0.1,macro:0.5})]) },

  // --- Haas / width ---
  { id: 'rp-width-haas', name: 'Haas Widener', category: 'Width', tags: ['haas','width','stereo'], author: 'NC Sound Lab', theoryNote: 'Haas effect: short delay on one side for width.', bpm: 120, state: state([S('s1','TEMPO_DELAY',{mix:0.5,feedback:0,time:12}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-width-ms', name: 'Mid-Side Boost', category: 'Width', tags: ['midside','width','stereo'], author: 'NC Sound Lab', theoryNote: 'Mid-side EQ: boost sides for width.', bpm: 120, state: state([S('s1','MID_SIDE_EQ',{midGain:0,sideGain:3}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-width-stereo', name: 'Stereo Enhancer', category: 'Width', tags: ['stereo','width','imager'], author: 'NC Sound Lab', theoryNote: 'Stereo imager for width.', bpm: 120, state: state([S('s1','CHORUS_WIDTH',{rate:0.5,depth:40,mix:30}, 'lfo',{depth:0.3,rateBeats:2,shape:'sine',target:'depth'})]) },

  // --- Creative combos ---
  { id: 'rp-combo-vocal-chop', name: 'Vocal Chop', category: 'Creative', tags: ['vocal','chop','glitch'], author: 'NC Sound Lab', theoryNote: 'Vocal + stutter + reverb for chops.', bpm: 128, state: state([S('s1','SIDECHAIN_DUCK',{threshold:-60,ratio:100,attack:1,release:10}, 'sequencer',{depth:1,steps:[1,0,0,1,0,1,0,0],stepsPerBeat:4,glide:0,target:'threshold'}), S('s2','PLATE_REVERB',{mix:0.3,decay:1.5,predelay:10}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-combo-bass-growl', name: 'Bass Growl', category: 'Creative', tags: ['bass','growl','distortion'], author: 'NC Sound Lab', theoryNote: 'Filter + saturation + LFO for growl.', bpm: 140, state: state([S('s1','LADDER_FILTER',{cutoff:800,resonance:12,drive:4}, 'lfo',{depth:0.9,rateBeats:0.5,shape:'sawUp',target:'cutoff'}), S('s2','SATURATION',{drive:10,mix:70}, 'lfo',{depth:0.4,rateBeats:0.25,shape:'sine',target:'drive'})]) },
  { id: 'rp-combo-lead-synth', name: 'Lead Synth', category: 'Creative', tags: ['lead','synth','bright'], author: 'NC Sound Lab', theoryNote: 'Bright lead with chorus + delay.', bpm: 128, state: state([S('s1','AIR_SHELF',{freq:8000,gain:4}, 'macro',{depth:0.1,macro:0.5}), S('s2','CHORUS_WIDTH',{rate:1.2,depth:40,mix:30}, 'lfo',{depth:0.3,rateBeats:2,shape:'sine',target:'depth'}), S('s3','TEMPO_DELAY',{mix:0.25,feedback:0.4,time:375}, 'macro',{depth:0.1,macro:0.5})]) },
  { id: 'rp-combo-pad-ambient', name: 'Ambient Pad', category: 'Creative', tags: ['pad','ambient','lush'], author: 'NC Sound Lab', theoryNote: 'Lush ambient pad.', bpm: 80, state: state([S('s1','HALL_REVERB',{mix:0.6,decay:4.5,predelay:40}, 'macro',{depth:0.2,macro:0.6}), S('s2','CHORUS_WIDTH',{rate:0.2,depth:50,mix:40}, 'lfo',{depth:0.4,rateBeats:8,shape:'sine',target:'depth'})]) },
  { id: 'rp-combo-drum-bus', name: 'Drum Bus', category: 'Creative', tags: ['drums','bus','glue'], author: 'NC Sound Lab', theoryNote: 'Drum bus glue: comp + saturation + transient.', bpm: 120, state: state([S('s1','VCA_BUS_COMP',{threshold:-8,ratio:2,attack:10,release:80}, 'macro',{depth:0.1,macro:0.5}), S('s2','SATURATION',{drive:3,mix:30}, 'macro',{depth:0.2,macro:0.5})]) },
  { id: 'rp-combo-master', name: 'Master Chain', category: 'Creative', tags: ['master','mastering','chain'], author: 'NC Sound Lab', theoryNote: 'Master chain: EQ + comp + limiter.', bpm: 120, state: state([S('s1','SSL_CHANNEL_EQ',{low:1,mid:0,high:1}, 'macro',{depth:0.1,macro:0.5}), S('s2','VCA_BUS_COMP',{threshold:-6,ratio:2,attack:30,release:100}, 'macro',{depth:0.1,macro:0.5}), S('s3','TRUE_PEAK_LIMITER',{ceiling:-0.3,release:50}, 'macro',{depth:0.1,macro:0.5})]) },
];

export function realPresetCount(): number {
  return REAL_PRESETS.length;
}
