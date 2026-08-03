/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AAF export + import panel (Phase 4.5) — Pro Tools interchange.
 *
 * Desktop-only (Tauri): exports the song's audible layers as a single
 * self-contained `.aaf` with one audio track per stem (embedded PCM), and
 * imports an AAF to recover tracks for A/B / tempo work.
 *
 * On the web build this renders a "desktop app only" badge.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileUp, FileDown, Loader2, Check, FileAudio, AlertTriangle, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { SoundLayer } from '../types';
import { audioEngine } from '../lib/audioEngine';
import { useReferenceTrackStore } from '../store/referenceTrackStore';
import { base64FromBytes, bytesFromBase64, deinterleavePcm, interleavePcm, padPcmTo } from '../audio/aafPcm';

interface AafExportPanelProps {
  layers: SoundLayer[];
  songName: string;
  bpm: number;
  onToast: (msg: string, type?: 'success' | 'info' | 'warn' | 'error') => void;
}

interface RecoveredTrack {
  name: string;
  sample_rate: number;
  channels: number;
  bits_per_sample: number;
  frames: number;
  pcm_base64: string;
}

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Convert recovered PCM back to an AudioBuffer (for reference playback). */
function pcmToAudioBuffer(
  pcm: Uint8Array,
  sampleRate: number,
  channels: number,
  bits: number
): AudioBuffer {
  const channelsData = deinterleavePcm(pcm, Math.max(1, channels), bits as 16 | 24 | 32);
  const frames = channelsData[0]?.length ?? 0;
  const ctx = new OfflineAudioContext(Math.max(1, channels), Math.max(1, frames), sampleRate);
  const buffer = ctx.createBuffer(Math.max(1, channels), Math.max(1, frames), sampleRate);
  for (let c = 0; c < Math.max(1, channels); c++) {
    buffer.copyToChannel(channelsData[c] ?? new Float32Array(frames), c);
  }
  return buffer;
}

/**
 * Render one layer through its FX chain and return interleaved LE PCM
 * (24-bit) at 48 kHz, padded to `frames`.
 */
async function renderStemPcm(
  layer: SoundLayer,
  durationSec: number,
  frames: number
): Promise<{ pcm: Uint8Array; channels: number; bits: number; frames: number }> {
  const buffer = await audioEngine.exportLayerStem(layer, durationSec, 48000);
  const channels = Math.min(2, buffer.numberOfChannels || 2);
  const BITS = 24;
  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c));
  return {
    pcm: interleavePcm(chans, frames, BITS),
    channels,
    bits: BITS,
    frames,
  };
}

export function AafExportPanel({ layers, songName, bpm, onToast }: AafExportPanelProps) {
  const [openPanel, setOpenPanel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bars, setBars] = useState(8);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [imported, setImported] = useState<RecoveredTrack[] | null>(null);
  const [importedSong, setImportedSong] = useState('');

  const desktop = isTauri();
  const durationSec = (bars * 4 * 60) / Math.max(30, bpm);

  const exportAaf = async () => {
    if (!desktop) return;
    setExporting(true);
    setLastResult(null);
    try {
      const defaultPath = `${songName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'Song'}.aaf`;
      const outputPath = await save({
        defaultPath,
        filters: [{ name: 'AAF (Pro Tools)', extensions: ['aaf'] }],
      });
      if (!outputPath) return; // cancelled

      const audible = layers.filter((l) => l.enabled);
      if (audible.length === 0) {
        onToast('No audible layers to export', 'warn');
        return;
      }

      // Render all stems, then pad each to the longest so Pro Tools gets
      // equal-length tracks.
      const rendered = await Promise.all(
        audible.map((l) => renderStemPcm(l, durationSec, Math.ceil(48000 * durationSec)))
      );
      const maxFrames = Math.max(...rendered.map((r) => r.frames));

      const stems = audible.map((l, i) => {
        const r = rendered[i];
        const frames = maxFrames;
        const bytesPerSample = r.bits / 8;
        const pcm = padPcmTo(r.pcm, frames, r.channels, bytesPerSample);
        return {
          name: l.name,
          sample_rate: 48000,
          channels: r.channels,
          bits_per_sample: r.bits,
          frames,
          pcm_base64: base64FromBytes(pcm),
        };
      });

      const result = await invoke<{ path: string; bytes: number; tracks: number }>(
        'export_aaf_session',
        {
          payload: { song_name: songName || 'Untitled', stems, output_path: outputPath },
        }
      );
      setLastResult(`${result.path} (${result.tracks} tracks, ${(result.bytes / 1024).toFixed(0)} KB)`);
      onToast(`Exported AAF: ${result.tracks} tracks`, 'success');
    } catch (e) {
      console.error('AAF export failed', e);
      onToast(`AAF export failed: ${String(e)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const importAaf = async () => {
    if (!desktop) return;
    setImporting(true);
    setImported(null);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: 'AAF (Pro Tools)', extensions: ['aaf'] }],
      });
      if (!path) return; // cancelled
      const result = await invoke<{ song_name: string; tracks: RecoveredTrack[] }>(
        'import_aaf_session',
        { path }
      );
      setImportedSong(result.song_name);
      setImported(result.tracks);
      onToast(`Imported AAF: ${result.tracks.length} tracks`, 'success');
    } catch (e) {
      console.error('AAF import failed', e);
      onToast(`AAF import failed: ${String(e)}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  const useAsReference = (track: RecoveredTrack) => {
    try {
      const bytes = bytesFromBase64(track.pcm_base64);
      const buffer = pcmToAudioBuffer(
        bytes,
        track.sample_rate,
        Math.max(1, track.channels),
        track.bits_per_sample
      );
      useReferenceTrackStore.getState().setBuffer(buffer, {
        name: track.name,
        sourceSampleRate: track.sample_rate,
        durationSec: buffer.duration,
        channels: Math.max(1, track.channels),
        sizeBytes: bytes.length,
        importedAt: new Date().toISOString(),
        formatLabel: 'AAF (.aaf)',
      });
      onToast(`"${track.name}" loaded as reference`, 'success');
    } catch (e) {
      console.error(e);
      onToast(`Could not load track as reference: ${String(e)}`, 'error');
    }
  };

  return (
    <>
      <button
        onClick={() => setOpenPanel(true)}
        title="AAF export / import (Pro Tools)"
        className="px-2.5 py-1.5 rounded-lg border border-[#1e293b] bg-black text-slate-300 hover:text-white hover:border-blue-600 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
      >
        <FileAudio size={13} className="text-blue-400" />
        <span className="hidden sm:inline">AAF</span>
      </button>

      <AnimatePresence>
        {openPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpenPanel(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-[#0d0f15] border border-[#1e293b] rounded-2xl shadow-2xl shadow-blue-900/30 p-5 max-h-[85vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                    <FileAudio size={16} className="text-blue-400" /> AAF Interchange
                  </h2>
                  <p className="text-[10px] font-mono text-slate-500 mt-1">
                    Pro Tools · one audio track per stem · embedded PCM
                  </p>
                </div>
                <button
                  onClick={() => setOpenPanel(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e293b]"
                >
                  <X size={16} />
                </button>
              </div>

              {!desktop ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <AlertTriangle size={28} className="text-yellow-400" />
                  <p className="text-xs text-slate-300 font-mono">
                    AAF export/import is available in the{' '}
                    <span className="text-white font-black">desktop app</span>.
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono max-w-sm">
                    Download the NC Sound Lab Studio desktop build to hand stems to Pro Tools
                    as a real .aaf session.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Export */}
                  <div className="bg-black/40 border border-[#1e293b] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-blue-300">
                        Export AAF
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {layers.filter((l) => l.enabled).length} stems · {bars} bars
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[9px] font-mono text-slate-500 uppercase">Length</span>
                      {[4, 8, 16].map((b) => (
                        <button
                          key={b}
                          onClick={() => setBars(b)}
                          className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold ${
                            bars === b
                              ? 'bg-blue-600 text-white'
                              : 'bg-[#1e293b] text-slate-400 hover:text-white'
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={exportAaf}
                      disabled={exporting || layers.filter((l) => l.enabled).length === 0}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-yellow-500 to-purple-600 text-black font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                      {exporting ? 'Rendering stems…' : 'Export to Pro Tools AAF'}
                    </button>
                    {lastResult && (
                      <p className="mt-2 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 break-all">
                        <Check size={12} /> {lastResult}
                      </p>
                    )}
                  </div>

                  {/* Import */}
                  <div className="bg-black/40 border border-[#1e293b] rounded-xl p-4">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-purple-300">
                      Import AAF
                    </span>
                    <button
                      onClick={importAaf}
                      disabled={importing}
                      className="mt-2 w-full py-2.5 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-white text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                      {importing ? 'Importing…' : 'Open an .aaf file'}
                    </button>
                    {imported && imported.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
                          {importedSong || 'Session'} — {imported.length} tracks
                        </p>
                        {imported.map((t, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-2 bg-[#0f172a] border border-[#1e293b] rounded-lg px-2.5 py-1.5"
                          >
                            <div className="min-w-0">
                              <p className="text-[11px] font-mono text-white truncate">{t.name}</p>
                              <p className="text-[9px] font-mono text-slate-500">
                                {t.sample_rate / 1000} kHz · {t.channels === 1 ? 'mono' : 'stereo'} ·{' '}
                                {t.bits_per_sample}-bit · {(t.frames / t.sample_rate).toFixed(1)}s
                              </p>
                            </div>
                            <button
                              onClick={() => useAsReference(t)}
                              className="shrink-0 px-2 py-1 rounded-md bg-[#1e293b] hover:bg-blue-600 text-slate-300 hover:text-white text-[9px] font-mono font-bold uppercase"
                            >
                              Reference
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
