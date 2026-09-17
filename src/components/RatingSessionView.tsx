/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rating session summary + setup + orchestrator.
 *
 * - Setup: pick session length, show existing standings for this seed.
 * - Active: hands off to RatingPairPlayer.
 * - Summary: standings board, "use as next evolve parent" CTA, export.
 */

import { useEffect, useMemo, useState } from 'react';
import { Download, ChevronRight, Star, Trophy, ArrowUp } from 'lucide-react';
import { useRatingStore } from '../lib/rating/store';
import { RatingPairPlayer } from './RatingPairPlayer';
import {
  fetchEloStandings,
  fetchRatingChoicesBySession,
  fetchRatingSessions,
  saveEloStandings,
  saveRatingChoice,
  saveRatingSession,
  trimRatingSessions,
  rebuildStandingsFromChoices,
} from '../lib/rating/ratingDB';
import {
  buildExportEnvelope,
  downloadExport,
} from '../lib/rating/export';
import { trackEvent } from '../lib/analytics';
import type { Confidence, DimensionTags, RatingPair } from '../lib/rating/types';

const APP_VERSION = '1.1.0';
const MAX_SKIPS = 2;

interface SetupScreenProps {
  onStart: (opts: { sessionLen: 10 | 20 | 40 }) => void;
  onCancel: () => void;
  priorSessions: number;
  priorPairs: number;
  standingCount: number;
}

function SetupScreen({ onStart, onCancel, priorSessions, priorPairs, standingCount }: SetupScreenProps) {
  const [sessionLen, setSessionLen] = useState<10 | 20 | 40>(10);

  return (
    <div className="w-full max-w-2xl mx-auto p-6 rounded-2xl border border-slate-700/60 bg-[#0c0c10]/90 space-y-5">
      <div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-1">
          Blind A/B rating session
        </div>
        <h2 className="text-xl font-bold text-slate-100">Rate your evolved variations</h2>
        <p className="text-sm text-slate-400 mt-2">
          Forced choice · listen until both sides reach 60% of the loop before you decide.
          Your ratings are private and never leave the device unless you export them.
        </p>
      </div>

      <div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-2">
          Session length
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([10, 20, 40] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSessionLen(n)}
              className={`px-3 py-2 rounded-md text-sm font-mono border ${
                sessionLen === n
                  ? 'bg-blue-500/30 border-blue-400/60 text-blue-100'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              {n} pairs · ~{Math.round(n * 0.5)} min
            </button>
          ))}
        </div>
      </div>

      {priorSessions > 0 && (
        <div className="text-xs text-slate-500 font-mono">
          Continuing a lineage with {priorSessions} prior session{priorSessions === 1 ? '' : 's'} · {priorPairs} rated pair{priorPairs === 1 ? '' : 's'} · {standingCount} variation{standingCount === 1 ? '' : 's'} rated
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onStart({ sessionLen })}
          className="flex-1 px-4 py-3 rounded-md bg-emerald-500/30 border border-emerald-400/60 text-emerald-100 font-mono font-bold uppercase tracking-wider hover:bg-emerald-500/40"
        >
          Start blind session
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-3 rounded-md bg-slate-800/60 border border-slate-700 text-slate-300 font-mono uppercase tracking-wider hover:bg-slate-700/60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface SummaryScreenProps {
  onClose: () => void;
  onUseParent: (paramHash: string) => void;
}

function SummaryScreen({ onClose, onUseParent }: SummaryScreenProps) {
  const session = useRatingStore((s) => s.session);
  const choices = useRatingStore((s) => s.summaryChoices);
  const elapsedMs = useRatingStore((s) => s.summaryElapsedMs);
  const standings = useRatingStore((s) => s.standings);
  const seed = useRatingStore((s) => s.seed);

  const top10 = standings.slice(0, 10);

  const tagFreq = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of choices) {
      for (const t of c.dimensions.tags) {
        m.set(t, (m.get(t) ?? 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [choices]);

  const exportRatings = async () => {
    // Export a CONSISTENT snapshot: this session plus its stored, hash-bearing
    // choice rows (`aHash`/`bHash`/`kind`) so a consumer can join choices to
    // Elo standings. `summaryChoices` alone omits those hashes and mixes scopes.
    const sessions = session ? [session] : await fetchRatingSessions();
    const storedChoices = session ? await fetchRatingChoicesBySession(session.sessionId) : [];
    const envelope = buildExportEnvelope(sessions, storedChoices, standings, APP_VERSION);
    downloadExport(envelope);
    trackEvent('rating_exported', { session_count: sessions.length });
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-6 rounded-2xl border border-slate-700/60 bg-[#0c0c10]/90 space-y-5">
      <div>
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-1">
          Session complete
        </div>
        <h2 className="text-xl font-bold text-slate-100">
          {session?.completedPairs ?? 0} pairs · {session?.skippedPairs ?? 0} skip{session?.skippedPairs === 1 ? '' : 's'} ·{' '}
          {Math.round((elapsedMs ?? 0) / 1000)}s
        </h2>
        {seed && (
          <p className="text-xs text-slate-500 font-mono mt-1">Seed: {seed.seedId}</p>
        )}
      </div>

      <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
          <Trophy className="w-3 h-3" /> Lineage board (top 10)
        </div>
        {top10.length === 0 ? (
          <div className="text-sm text-slate-500">No normal pairs rated yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-widest text-slate-500 text-left">
                <th className="pb-2">#</th>
                <th className="pb-2">Hash</th>
                <th className="pb-2 text-right">Rating</th>
                <th className="pb-2 text-right">W-L</th>
                <th className="pb-2 text-right">Seen</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {top10.map((s, i) => (
                <tr key={s.paramHash} className="border-t border-slate-800">
                  <td className="py-2 font-mono text-slate-500">{i + 1}</td>
                  <td className="py-2 font-mono text-slate-300 text-xs">{s.paramHash.slice(0, 8)}…</td>
                  <td className="py-2 text-right font-mono text-slate-200">{s.rating.toFixed(0)}</td>
                  <td className="py-2 text-right font-mono text-slate-400">{s.wins}-{s.losses}</td>
                  <td className="py-2 text-right font-mono text-slate-400">{s.exposures}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onUseParent(s.paramHash)}
                      className="px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30 flex items-center gap-1 ml-auto"
                    >
                      <ArrowUp className="w-3 h-3" /> Use as parent
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {tagFreq.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
            <Star className="w-3 h-3" /> Dimension tags
          </div>
          <div className="flex flex-wrap gap-2">
            {tagFreq.map(([t, n]) => (
              <div key={t} className="px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700 text-xs font-mono text-slate-300">
                {t} · {n}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={exportRatings}
          className="px-4 py-3 rounded-md bg-blue-500/30 border border-blue-400/60 text-blue-100 font-mono font-bold uppercase tracking-wider hover:bg-blue-500/40 flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" /> Export ratings JSON
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-3 rounded-md bg-slate-800/60 border border-slate-700 text-slate-200 font-mono uppercase tracking-wider hover:bg-slate-700/60 flex items-center justify-center gap-2"
        >
          Close <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export interface RatingSessionViewProps {
  /** When the user clicks "use as next evolve parent" — the parent panel
   *  wires this to its own state (see EvolutionPanel). */
  onUseParent?: (paramHash: string) => void;
  /** The variations to rate — typically the latest evolve batch + the seed. */
  variations: Array<{
    paramHash: string;
    params: Record<string, number | string | boolean>;
    seedId: string;
    generation: number;
    origin: 'evolve' | 'seed' | 'hand_tuned';
    renderDurationMs: number;
    createdAt: number;
    /** The decoded AudioBuffer — attached at runtime; not in the export. */
    buffer?: AudioBuffer;
  }>;
  /** The unmutated seed render. */
  seed: {
    paramHash: string;
    params: Record<string, number | string | boolean>;
    seedId: string;
    generation: number;
    origin: 'seed';
    renderDurationMs: number;
    createdAt: number;
    buffer?: AudioBuffer;
  };
  /** When the user dismisses the modal entirely. */
  onClose: () => void;
  /** Source tag for analytics + the session record. */
  source?: 'evolution_panel' | 'compare_engine' | 'manual';
}

export function RatingSessionView({
  variations,
  seed,
  onClose,
  onUseParent,
  source = 'evolution_panel',
}: RatingSessionViewProps) {
  const phase = useRatingStore((s) => s.phase);
  const session = useRatingStore((s) => s.session);
  const queue = useRatingStore((s) => s.queue);
  const currentIndex = useRatingStore((s) => s.currentIndex);
  const standings = useRatingStore((s) => s.standings);
  const startSession = useRatingStore((s) => s.startSession);
  const submitChoice = useRatingStore((s) => s.submitChoice);
  const attemptSkip = useRatingStore((s) => s.attemptSkip);
  const endSession = useRatingStore((s) => s.endSession);
  const reset = useRatingStore((s) => s.reset);

  const [priorSessions, setPriorSessions] = useState(0);
  const [priorPairs, setPriorPairs] = useState(0);
  const [pendingUseParent, setPendingUseParent] = useState<string | null>(null);

  // Bootstrap: load prior standings + sessions.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let prior = await fetchEloStandings();
        if (prior.length === 0) {
          // Try rebuild from any existing choices (e.g. first run after upgrade).
          prior = await rebuildStandingsFromChoices();
        }
        const sessions = await fetchRatingSessions();
        if (cancelled) return;
        useRatingStore.getState().loadStandings(prior);
        setPriorSessions(sessions.length);
        setPriorPairs(prior.reduce((s, e) => s + e.wins + e.losses, 0));
      } catch {
        // graceful: empty state
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist choices and the session to IndexedDB.
  useEffect(() => {
    if (!session) return;
    saveRatingSession(session);
  }, [session]);

  // Persist standings after each change (debounced via microtask).
  const saveStandings = useMemo(
    () => async () => {
      if (standings.length === 0) return;
      await saveEloStandings(standings);
    },
    [standings],
  );
  useEffect(() => {
    const id = setTimeout(() => { saveStandings(); }, 200);
    return () => clearTimeout(id);
  }, [standings, saveStandings]);

  const handleStart = ({ sessionLen }: { sessionLen: 10 | 20 | 40 }) => {
    startSession({
      batch: variations,
      seed,
      sessionLen,
      source,
      appVersion: APP_VERSION,
      priorStandings: standings,
    });
  };

  const handleChoose = (choice: 'A' | 'B', meta: {
    confidence: Confidence;
    dimensions: DimensionTags;
    listenMsA: number;
    listenMsB: number;
    elapsedMs: number;
  }) => {
    const pair: RatingPair = queue[currentIndex];
    submitChoice({
      pair,
      choice,
      listenMsA: meta.listenMsA,
      listenMsB: meta.listenMsB,
      confidence: meta.confidence,
      dimensions: meta.dimensions,
      elapsedMs: meta.elapsedMs,
    });
    const stored = {
      pairId: pair.pairId,
      sessionId: session!.sessionId,
      choice,
      confidence: meta.confidence,
      dimensions: meta.dimensions,
      listenMsA: meta.listenMsA,
      listenMsB: meta.listenMsB,
      decidedAt: Date.now(),
      elapsedMs: meta.elapsedMs,
      aHash: pair.a.paramHash,
      bHash: pair.b.paramHash,
      kind: pair.kind,
    };
    saveRatingChoice(stored);
  };

  const handleSkip = () => {
    attemptSkip();
  };

  const handleClose = async () => {
    if (phase === 'active' && session) {
      endSession();
    }
    if (phase === 'summary' && session) {
      await saveEloStandings(useRatingStore.getState().standings);
      await trimRatingSessions();
    }
    if (pendingUseParent && onUseParent) {
      trackEvent('rating_parent_promoted', { generation: 0 });
      onUseParent(pendingUseParent);
    }
    reset();
    onClose();
  };

  if (phase === 'active' && session && queue[currentIndex]) {
    const skipsRemaining = Math.max(0, MAX_SKIPS - session.skippedPairs);
    const pair = queue[currentIndex];
    const bufA = (pair.a as { buffer?: AudioBuffer }).buffer;
    const bufB = (pair.b as { buffer?: AudioBuffer }).buffer;
    if (!bufA || !bufB) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md p-6 rounded-2xl border border-amber-700/60 bg-[#0c0c10] text-center space-y-3">
            <div className="text-amber-400 font-mono uppercase tracking-widest text-[10px]">Audio buffers missing</div>
            <div className="text-slate-300 text-sm">
              Could not load one of the variation renders. Try regenerating the batch and starting a fresh session.
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-md bg-slate-800/60 border border-slate-700 text-slate-200 font-mono uppercase tracking-wider hover:bg-slate-700/60"
            >
              Close
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
        <RatingPairPlayer
          pairId={pair.pairId}
          bufferA={bufA}
          bufferB={bufB}
          loopDurationSec={Math.max(pair.a.renderDurationMs, pair.b.renderDurationMs) / 1000}
          pairIndex={pair.indexInSession}
          kind={pair.kind}
          onChoose={handleChoose}
          onSkip={handleSkip}
          skipsRemaining={skipsRemaining}
        />
      </div>
    );
  }

  if (phase === 'summary') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
        <SummaryScreen
          onClose={handleClose}
          onUseParent={(hash) => setPendingUseParent(hash)}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <SetupScreen
        onStart={handleStart}
        onCancel={handleClose}
        priorSessions={priorSessions}
        priorPairs={priorPairs}
        standingCount={standings.length}
      />
    </div>
  );
}
