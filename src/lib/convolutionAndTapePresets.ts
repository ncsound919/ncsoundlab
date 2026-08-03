import { ConvolutionPreset, TapeDelayPreset } from '../types';

export const CONVOLUTION_REVERB_PRESETS: ConvolutionPreset[] = [
  // 1. Natural Spaces
  {
    id: 'practice_gym_room',
    name: 'Practice Gym Room',
    category: 'room',
    irId: 'room_short',
    preEq: {
      hpFreq: 120,
      tiltAmount: -0.2, // slightly warm
    },
    irProcessing: {
      stretchFactor: 0.85,
      reverse: false,
      irLowShelfDb: 1.0,
      irHighShelfDb: -2.0,
      mode: 'fullband',
    },
    mix: {
      dry: 0.8,
      wet: 0.25,
    },
    postEq: {
      dampingFreq: 8500,
      presenceDb: 1.0,
      airDb: 0.0,
    },
    nonlinearTail: {
      saturationAmount: 0.12,
      tailModDepth: 0.05,
      tailModRate: 0.2,
    },
  },
  {
    id: 'game_arena_bowl',
    name: 'Game Arena Bowl',
    category: 'hall',
    irId: 'arena_hall',
    preEq: {
      hpFreq: 80,
      tiltAmount: -0.4, // darker lows
    },
    irProcessing: {
      stretchFactor: 1.35,
      reverse: false,
      irLowShelfDb: 2.5,
      irHighShelfDb: -3.0,
      mode: 'multiband',
      multibandIRs: {
        low: 'arena_sub_dark',
        mid: 'arena_mid_reflect',
        high: 'arena_high_air',
      },
    },
    mix: {
      dry: 0.7,
      wet: 0.45,
    },
    postEq: {
      dampingFreq: 6000,
      presenceDb: -1.0,
      airDb: 2.0,
    },
    nonlinearTail: {
      saturationAmount: 0.2,
      tailModDepth: 0.15,
      tailModRate: 0.35,
    },
  },

  // 2. Plates & Classics
  {
    id: 'bright_plate',
    name: 'Bright Plate',
    category: 'plate',
    irId: 'plate_vintage',
    preEq: {
      hpFreq: 160,
      tiltAmount: 0.6, // bright tilt
    },
    irProcessing: {
      stretchFactor: 1.0,
      reverse: false,
      irLowShelfDb: -1.5,
      irHighShelfDb: 3.0,
      mode: 'fullband',
    },
    mix: {
      dry: 0.75,
      wet: 0.35,
    },
    postEq: {
      dampingFreq: 14000,
      presenceDb: 2.0,
      airDb: 4.5, // air boost
    },
    nonlinearTail: {
      saturationAmount: 0.15,
      tailModDepth: 0.1,
      tailModRate: 0.5,
    },
  },
  {
    id: 'vocal_plate',
    name: 'Vocal Plate',
    category: 'plate',
    irId: 'plate_vocal_silky',
    preEq: {
      hpFreq: 150,
      tiltAmount: 0.2,
    },
    irProcessing: {
      stretchFactor: 1.1,
      reverse: false,
      irLowShelfDb: -1.0,
      irHighShelfDb: 1.5,
      mode: 'fullband',
    },
    mix: {
      dry: 0.75,
      wet: 0.3,
    },
    postEq: {
      dampingFreq: 10000, // gentle damping
      presenceDb: 3.5,     // mid emphasis
      airDb: 1.5,
    },
    nonlinearTail: {
      saturationAmount: 0.1,
      tailModDepth: 0.15,
      tailModRate: 0.4,
    },
  },

  // 3. Design / FX
  {
    id: 'reverse_ghost',
    name: 'Reverse Ghost',
    category: 'fx',
    irId: 'ghost_swell',
    preEq: {
      hpFreq: 220,
      tiltAmount: 0.3,
    },
    irProcessing: {
      stretchFactor: 1.5,
      reverse: true, // reversed IR
      irLowShelfDb: -2.0,
      irHighShelfDb: 4.0,
      mode: 'fullband',
    },
    mix: {
      dry: 0.6,
      wet: 0.5,
    },
    postEq: {
      dampingFreq: 4200, // high damping
      presenceDb: 1.0,
      airDb: -1.0,
    },
    nonlinearTail: {
      saturationAmount: 0.35,
      tailModDepth: 0.75, // heavy tail modulation
      tailModRate: 1.2,
    },
  },
  {
    id: 'metallic_chamber',
    name: 'Metallic Chamber',
    category: 'special',
    irId: 'chamber_metal',
    preEq: {
      hpFreq: 180,
      tiltAmount: 0.3,
    },
    irProcessing: {
      stretchFactor: 1.2,
      reverse: false,
      irLowShelfDb: 0.0,
      irHighShelfDb: 2.5,
      mode: 'multiband',
      multibandIRs: {
        low: 'metal_sub',
        mid: 'metallic_resonator_mid', // metallic mid IR
        high: 'metal_sizzle',
      },
    },
    mix: {
      dry: 0.7,
      wet: 0.4,
    },
    postEq: {
      dampingFreq: 12000,
      presenceDb: 2.5,
      airDb: 3.0,
    },
    nonlinearTail: {
      saturationAmount: 0.4,
      tailModDepth: 0.3,
      tailModRate: 0.8,
    },
  },

  // 4. Hybrid
  {
    id: 'tape_room',
    name: 'Tape Room',
    category: 'room',
    irId: 'room_tape_warm',
    preEq: {
      hpFreq: 100,
      tiltAmount: -0.5, // darker IR
    },
    irProcessing: {
      stretchFactor: 0.95,
      reverse: false,
      irLowShelfDb: 1.5,
      irHighShelfDb: -3.0,
      mode: 'fullband',
    },
    mix: {
      dry: 0.8,
      wet: 0.3,
    },
    postEq: {
      dampingFreq: 7000,
      presenceDb: 0.5,
      airDb: -1.5,
    },
    nonlinearTail: {
      saturationAmount: 0.38, // subtle tape saturation
      tailModDepth: 0.45,    // tail modulation
      tailModRate: 0.6,
    },
  },
  {
    id: 'shimmer_space',
    name: 'Shimmer Space',
    category: 'special',
    irId: 'shimmer_ether',
    preEq: {
      hpFreq: 250,
      tiltAmount: 0.5,
    },
    irProcessing: {
      stretchFactor: 1.8,
      reverse: false,
      irLowShelfDb: -3.0,
      irHighShelfDb: 5.0,
      mode: 'fullband',
    },
    mix: {
      dry: 0.65,
      wet: 0.55,
    },
    postEq: {
      dampingFreq: 16000,
      presenceDb: 1.5,
      airDb: 6.0, // high air
    },
    nonlinearTail: {
      saturationAmount: 0.2,
      tailModDepth: 0.65, // pitch micro-mod on tail
      tailModRate: 2.5,
    },
  },
];

export const TAPE_DELAY_PRESETS: TapeDelayPreset[] = [
  // 1. Utility
  {
    id: 'short_slap',
    name: 'Short Slap',
    category: 'utility',
    preFilter: {
      hpFreq: 120,
      lpFreq: 12000,
      midBumpDb: 1.0,
    },
    saturation: {
      drive: 0.15,  // light saturation
      biasTilt: 0.0,
    },
    heads: {
      count: 1, // single head
      timesMs: [85], // short time
      levels: [1.0],
      pans: [0],
      syncMode: 'free',
    },
    modulation: {
      wowDepthMs: 0.1,
      wowRateHz: 0.3,
      flutterDepthMs: 0.05,
      flutterRateHz: 3.0,
    },
    feedback: {
      amount: 0.15, // low feedback
      filterType: 'lp',
      filterFreq: 8000,
      extraSaturation: 0.1,
    },
    mix: {
      dry: 0.85,
      wet: 0.25,
    },
  },
  {
    id: 'subtle_echo',
    name: 'Subtle Echo',
    category: 'utility',
    preFilter: {
      hpFreq: 150,
      lpFreq: 10000,
      midBumpDb: 0.5,
    },
    saturation: {
      drive: 0.2,
      biasTilt: -0.1,
    },
    heads: {
      count: 1,
      timesMs: [250],
      levels: [1.0],
      pans: [0],
      syncMode: 'free',
    },
    modulation: {
      wowDepthMs: 0.15, // gentle wow
      wowRateHz: 0.2,
      flutterDepthMs: 0.08,
      flutterRateHz: 2.5,
    },
    feedback: {
      amount: 0.22, // low feedback
      filterType: 'lp',
      filterFreq: 7000,
      extraSaturation: 0.12,
    },
    mix: {
      dry: 0.8,
      wet: 0.3,
    },
  },

  // 2. Space
  {
    id: 'tape_room_echo',
    name: 'Tape Room Echo',
    category: 'space',
    preFilter: {
      hpFreq: 180,
      lpFreq: 11000,
      midBumpDb: 1.5,
    },
    saturation: {
      drive: 0.3,
      biasTilt: 0.1,
    },
    heads: {
      count: 3, // multi-head
      timesMs: [120, 240, 360], // short times
      levels: [1.0, 0.7, 0.45],
      pans: [-0.6, 0.6, 0.0],
      syncMode: 'free',
    },
    modulation: {
      wowDepthMs: 0.3,
      wowRateHz: 0.4,
      flutterDepthMs: 0.15,
      flutterRateHz: 4.0,
    },
    feedback: {
      amount: 0.42,
      filterType: 'lp',
      filterFreq: 6500,
      extraSaturation: 0.25,
      miniIRId: 'room_short', // miniIR in feedback
    },
    mix: {
      dry: 0.75,
      wet: 0.4,
    },
  },
  {
    id: 'arena_tape',
    name: 'Arena Tape',
    category: 'space',
    preFilter: {
      hpFreq: 100,
      lpFreq: 8000,
      midBumpDb: 2.0,
    },
    saturation: {
      drive: 0.38,
      biasTilt: -0.3, // darker bias
    },
    heads: {
      count: 2,
      timesMs: [380, 760], // longer times
      levels: [1.0, 0.65],
      pans: [-0.5, 0.5],
      syncMode: 'free',
    },
    modulation: {
      wowDepthMs: 0.4,
      wowRateHz: 0.3,
      flutterDepthMs: 0.2,
      flutterRateHz: 3.5,
    },
    feedback: {
      amount: 0.58,
      filterType: 'lp',
      filterFreq: 3200, // darker feedback filter
      extraSaturation: 0.3,
      miniIRId: 'arena_hall',
    },
    mix: {
      dry: 0.7,
      wet: 0.45,
    },
  },

  // 3. Character
  {
    id: 'worn_cassette',
    name: 'Worn Cassette',
    category: 'character',
    preFilter: {
      hpFreq: 220,
      lpFreq: 6500, // HF loss
      midBumpDb: 3.0,
    },
    saturation: {
      drive: 0.6, // noise via saturation
      biasTilt: -0.4,
    },
    heads: {
      count: 2,
      timesMs: [210, 420],
      levels: [1.0, 0.7],
      pans: [-0.3, 0.3],
      syncMode: 'free',
    },
    modulation: {
      wowDepthMs: 2.5,   // strong wow
      wowRateHz: 0.45,
      flutterDepthMs: 1.2, // strong flutter
      flutterRateHz: 6.0,
    },
    feedback: {
      amount: 0.48,
      filterType: 'lp',
      filterFreq: 4500,
      extraSaturation: 0.5,
    },
    mix: {
      dry: 0.75,
      wet: 0.42,
    },
  },
  {
    id: 'dirty_dub',
    name: 'Dirty Dub',
    category: 'character',
    preFilter: {
      hpFreq: 200,
      lpFreq: 7500,
      midBumpDb: 4.0,
    },
    saturation: {
      drive: 0.65,
      biasTilt: 0.2,
    },
    heads: {
      count: 3,
      timesMs: [300, 600, 900],
      levels: [1.0, 0.8, 0.5],
      pans: [-0.7, 0.7, 0.0],
      syncMode: 'free',
    },
    modulation: {
      wowDepthMs: 1.2,
      wowRateHz: 0.35,
      flutterDepthMs: 0.6,
      flutterRateHz: 5.0,
    },
    feedback: {
      amount: 0.75, // high feedback
      filterType: 'band', // bandpass in loop
      filterFreq: 1200,
      extraSaturation: 0.65, // extra saturation
    },
    mix: {
      dry: 0.7,
      wet: 0.5,
    },
  },

  // 4. FX
  {
    id: 'pitchy_chaos',
    name: 'Pitchy Chaos',
    category: 'fx',
    preFilter: {
      hpFreq: 150,
      lpFreq: 14000,
      midBumpDb: 1.0,
    },
    saturation: {
      drive: 0.45,
      biasTilt: 0.1,
    },
    heads: {
      count: 3, // multiple heads
      timesMs: [180, 360, 540],
      levels: [1.0, 0.75, 0.5],
      pans: [-0.8, 0.8, 0.0],
      syncMode: 'free',
    },
    modulation: {
      wowDepthMs: 6.0,     // exaggerated wow
      wowRateHz: 0.8,
      flutterDepthMs: 3.5, // exaggerated flutter
      flutterRateHz: 8.5,
    },
    feedback: {
      amount: 0.68,
      filterType: 'band',
      filterFreq: 2200,
      extraSaturation: 0.4,
    },
    mix: {
      dry: 0.6,
      wet: 0.55,
    },
  },
  {
    id: 'feedback_wash',
    name: 'Feedback Wash',
    category: 'fx',
    preFilter: {
      hpFreq: 100,
      lpFreq: 9000,
      midBumpDb: 2.0,
    },
    saturation: {
      drive: 0.4,
      biasTilt: -0.2,
    },
    heads: {
      count: 2,
      timesMs: [400, 800],
      levels: [1.0, 0.7],
      pans: [-0.6, 0.6],
      syncMode: 'free',
    },
    modulation: {
      wowDepthMs: 1.5,
      wowRateHz: 0.25,
      flutterDepthMs: 0.8,
      flutterRateHz: 4.5,
    },
    feedback: {
      amount: 0.88, // near self-oscillation
      filterType: 'lp',
      filterFreq: 2500, // dark filter
      extraSaturation: 0.5,
      miniIRId: 'space_tail', // miniIR in feedback
    },
    mix: {
      dry: 0.65,
      wet: 0.6,
    },
  },
];
