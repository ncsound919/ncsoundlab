import { create } from 'zustand';
import { ReferenceTrack, CompareEngineSnapshot } from '../types';
import { compareEngine } from '../audio/CompareEngine';

interface CompareEngineStore {
  referenceTracks: ReferenceTrack[];
  activeTrackId: string | null;
  isPlayingRef: boolean;
  isPlayingMix: boolean;
  activeSource: 'A' | 'B';
  refGainDb: number;
  loopSync: boolean;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  levelMatchEnabled: boolean;
  snapshots: CompareEngineSnapshot[];
  mixTrackName: string | null;
  mixTrackDuration: number;

  loadReferenceTrack: (file: File) => Promise<void>;
  loadMixTrack: (file: File) => Promise<void>;
  selectReferenceTrack: (id: string) => void;
  removeReferenceTrack: (id: string) => void;
  setSource: (source: 'A' | 'B') => void;
  togglePlayRef: () => void;
  togglePlayMix: () => void;
  stopRef: () => void;
  stopMix: () => void;
  setRefGain: (db: number) => void;
  setLoop: (start: number, end: number, enabled: boolean) => void;
  setLoopSync: (sync: boolean) => void;
  triggerLevelMatch: () => void;
  saveSnapshot: (name: string) => void;
  loadSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
}

export const useCompareEngineStore = create<CompareEngineStore>((set, get) => ({
  referenceTracks: [],
  activeTrackId: null,
  isPlayingRef: false,
  isPlayingMix: false,
  activeSource: 'A',
  refGainDb: 0,
  loopSync: true,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 10,
  levelMatchEnabled: false,
  snapshots: [],
  mixTrackName: null,
  mixTrackDuration: 0,

  loadReferenceTrack: async (file) => {
    try {
      const track = await compareEngine.loadTrackFromFile(file);
      set((state) => {
        const tracks = [...state.referenceTracks, track];
        return {
          referenceTracks: tracks,
          activeTrackId: state.activeTrackId || track.id,
          loopEnd: Math.min(10, track.duration),
        };
      });
    } catch (e) {
      console.error('Failed loading reference track', e);
    }
  },

  loadMixTrack: async (file) => {
    try {
      const track = await compareEngine.loadTrackFromFile(file);
      compareEngine.setMixBuffer(track.buffer);
      set({
        mixTrackName: track.name,
        mixTrackDuration: track.duration,
      });
    } catch (e) {
      console.error('Failed loading mix track', e);
    }
  },

  selectReferenceTrack: (id) => {
    const { isPlayingRef, referenceTracks } = get();
    const track = referenceTracks.find((t) => t.id === id);
    if (!track) return;
    set({ activeTrackId: id });
    if (isPlayingRef) {
      compareEngine.playReference(track.buffer, 0);
    }
  },

  removeReferenceTrack: (id) => {
    set((state) => {
      const updated = state.referenceTracks.filter((t) => t.id !== id);
      const nextActive = updated.length > 0 ? updated[0].id : null;
      return { referenceTracks: updated, activeTrackId: nextActive };
    });
  },

  setSource: (source) => {
    compareEngine.setSource(source);
    set({ activeSource: source });
  },

  togglePlayRef: () => {
    const { isPlayingRef, referenceTracks, activeTrackId } = get();
    const active = referenceTracks.find((t) => t.id === activeTrackId);
    if (!active) return;

    if (isPlayingRef) {
      compareEngine.pauseReference();
      set({ isPlayingRef: false });
    } else {
      const currentPos = compareEngine.getRefPlaybackPosition();
      compareEngine.playReference(active.buffer, currentPos);
      set({ isPlayingRef: true });
    }
  },

  togglePlayMix: () => {
    const { isPlayingMix } = get();
    if (isPlayingMix) {
      compareEngine.pauseMixFile();
      set({ isPlayingMix: false });
    } else {
      const currentPos = compareEngine.getMixPlaybackPosition();
      compareEngine.playMixFile(currentPos);
      set({ isPlayingMix: true });
    }
  },

  stopRef: () => {
    compareEngine.stopReference();
    set({ isPlayingRef: false });
  },

  stopMix: () => {
    compareEngine.stopMixFile();
    set({ isPlayingMix: false });
  },

  setRefGain: (db) => {
    compareEngine.setRefGain(db);
    set({ refGainDb: db });
  },

  setLoop: (start, end, enabled) => {
    compareEngine.setLoopA(start, end, enabled);
    if (get().loopSync) {
      compareEngine.setLoopB(start, end, enabled);
    }
    set({ loopStart: start, loopEnd: end, loopEnabled: enabled });
  },

  setLoopSync: (sync) => set({ loopSync: sync }),

  triggerLevelMatch: () => {
    const meters = compareEngine.getMeterData();
    const diff = meters.mixRms - meters.refRms;
    const offset = Math.max(-18, Math.min(18, diff));
    compareEngine.setRefGain(offset);
    set({ refGainDb: offset, levelMatchEnabled: true });
  },

  saveSnapshot: (name) => {
    const { activeTrackId, refGainDb, loopStart, loopEnd, snapshots } = get();
    if (!activeTrackId) return;
    const snap: CompareEngineSnapshot = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `snap-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      refTrackId: activeTrackId,
      refGainOffset: refGainDb,
      loopStart,
      loopEnd,
      createdAt: new Date().toLocaleTimeString(),
    };
    set({ snapshots: [...snapshots, snap].slice(-20) });
  },

  loadSnapshot: (id) => {
    const { snapshots, referenceTracks } = get();
    const snap = snapshots.find((s) => s.id === id);
    if (!snap) return;
    const track = referenceTracks.find((t) => t.id === snap.refTrackId);
    if (track) {
      set({
        activeTrackId: track.id,
        refGainDb: snap.refGainOffset,
        loopStart: snap.loopStart,
        loopEnd: snap.loopEnd,
      });
      compareEngine.setRefGain(snap.refGainOffset);
      compareEngine.setLoopA(snap.loopStart, snap.loopEnd, true);
    }
  },

  deleteSnapshot: (id) => {
    set((state) => ({
      snapshots: state.snapshots.filter((s) => s.id !== id),
    }));
  },
}));
