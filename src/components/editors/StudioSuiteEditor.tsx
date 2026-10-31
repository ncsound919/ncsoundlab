/** @license SPDX-License-Identifier: Apache-2.0 */
import React, { useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp, Download, Plus, Power, Trash2, Upload } from 'lucide-react';
import {
  FX_KINDS,
  clampParam,
  decodeChain,
  encodeChain,
  kindSpec,
  makeSlot,
  paramLabel,
  paramSpec,
  slotValue,
  type FxSlot,
} from '../../audio/studioFx/catalog';

interface StudioSuiteSettings {
  chain?: FxSlot[];
  bpm?: number;
}

interface Props {
  settings: StudioSuiteSettings;
  onChange: (settings: StudioSuiteSettings) => void;
}

/**
 * Editor for the shared NC Studio insert chain. The module itself is one rack
 * insert; this panel edits the ordered plugin list inside it. Chains export as
 * `nc.studiofx.v1`, the same document NC Studio and NC Phone Beat read, so a
 * mix created here can be printed on either app with identical parameters.
 */
export const StudioSuiteEditor: React.FC<Props> = ({ settings, onChange }) => {
  const chain = Array.isArray(settings.chain) ? settings.chain : [];
  const bpm = typeof settings.bpm === 'number' ? settings.bpm : 120;
  const fileRef = useRef<HTMLInputElement | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof FX_KINDS>();
    for (const kind of FX_KINDS) {
      const list = map.get(kind.category) ?? [];
      list.push(kind);
      map.set(kind.category, list);
    }
    return [...map.entries()];
  }, []);

  const setChain = (next: FxSlot[]) => onChange({ ...settings, chain: next, bpm });

  const updateSlot = (index: number, patch: Partial<FxSlot>) => {
    setChain(chain.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  };

  const setParam = (index: number, key: string, value: number) => {
    const slot = chain[index];
    const spec = paramSpec(slot.kind, key);
    updateSlot(index, {
      params: { ...slot.params, [key]: spec ? clampParam(spec, value) : value },
    });
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= chain.length) return;
    const next = [...chain];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setChain(next);
  };

  const add = (kind: string) => setChain([...chain, makeSlot(kind)]);

  const exportChain = () => {
    const doc = encodeChain(chain, 'NC Studio suite', bpm);
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'studio-suite.ncfx';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importChain = async (file: File | undefined) => {
    if (!file) return;
    try {
      const slots = decodeChain(await file.text());
      if (slots) setChain(slots);
    } catch {
      /* an unreadable file leaves the chain untouched */
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2A2A2E] pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-yellow-300">
            NC Studio suite
          </span>
          <span className="text-[9px] font-mono text-gray-500">
            {chain.length} insert{chain.length === 1 ? '' : 's'} · nc.studiofx.v1
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[10px] font-mono text-gray-400">
            BPM
            <input
              type="number"
              min={20}
              max={300}
              value={bpm}
              onChange={(event) => onChange({ ...settings, chain, bpm: Number(event.target.value) || 120 })}
              className="w-16 bg-black border border-[#2A2A2E] rounded px-2 py-1 text-xs text-white"
              aria-label="Tempo for grid-locked modules"
            />
          </label>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-[10px] font-mono text-gray-400 hover:text-white"
            title="Load a chain exported by any NC app"
          >
            <Upload className="w-3 h-3" /> Load
          </button>
          <button
            onClick={exportChain}
            disabled={chain.length === 0}
            className="flex items-center gap-1 text-[10px] font-mono text-gray-400 hover:text-white disabled:opacity-40"
            title="Export for NC Studio or NC Phone Beat"
          >
            <Download className="w-3 h-3" /> Export
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".ncfx,.json"
            className="hidden"
            onChange={(event) => void importChain(event.target.files?.[0])}
          />
        </div>
      </div>

      {chain.length === 0 && (
        <p className="text-[11px] font-mono text-gray-500">
          Empty chain. Add the studio modules below — the same order renders in every app.
        </p>
      )}

      {chain.map((slot, index) => {
        const spec = kindSpec(slot.kind);
        if (!spec) return null;
        return (
          <div key={slot.id} className="border border-[#2A2A2E] rounded-lg bg-black/40">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#2A2A2E]/60">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => updateSlot(index, { enabled: !slot.enabled })}
                  aria-label={slot.enabled ? `Bypass ${spec.name}` : `Enable ${spec.name}`}
                  className={`p-1 rounded border ${slot.enabled ? 'text-yellow-300 border-yellow-400/40' : 'text-gray-600 border-[#2A2A2E]'}`}
                >
                  <Power className="w-3 h-3" />
                </button>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{spec.name}</div>
                  <div className="text-[9px] font-mono text-gray-500 truncate">{spec.category}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => move(index, -1)} aria-label="Move earlier" className="p-1 text-gray-500 hover:text-white">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => move(index, 1)} aria-label="Move later" className="p-1 text-gray-500 hover:text-white">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setChain(chain.filter((_, i) => i !== index))}
                  aria-label={`Remove ${spec.name}`}
                  className="p-1 text-gray-500 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 p-3">
              {spec.params.map((param) => {
                const value = slotValue(slot, param.key);
                if (param.choices && param.choices.length > 0) {
                  return (
                    <label key={param.key} className="flex flex-col gap-1">
                      <span className="flex justify-between text-[9px] font-mono text-gray-400">
                        <span>{param.label}</span>
                        <span className="text-yellow-300">{paramLabel(param, value)}</span>
                      </span>
                      <select
                        value={value}
                        onChange={(event) => setParam(index, param.key, Number(event.target.value))}
                        className="bg-black border border-[#2A2A2E] rounded px-2 py-1 text-[11px] text-white"
                      >
                        {param.choices.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                const step = param.max - param.min > 100 ? 1 : 0.01;
                return (
                  <label key={param.key} className="flex flex-col gap-1">
                    <span className="flex justify-between text-[9px] font-mono text-gray-400">
                      <span>{param.label}</span>
                      <span className="text-yellow-300">{paramLabel(param, value)}</span>
                    </span>
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={step}
                      value={value}
                      onChange={(event) => setParam(index, param.key, Number(event.target.value))}
                      className="w-full accent-yellow-400"
                      aria-label={`${spec.name} ${param.label}`}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <select
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) {
              add(event.target.value);
              event.target.value = '';
            }
          }}
          className="flex-1 bg-black border border-[#2A2A2E] rounded px-2 py-1.5 text-[11px] text-white"
          aria-label="Add studio module"
        >
          <option value="" disabled>
            Add a studio module…
          </option>
          {grouped.map(([category, kinds]) => (
            <optgroup key={category} label={category}>
              {kinds.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <Plus className="w-3.5 h-3.5 text-gray-500" aria-hidden />
      </div>
    </div>
  );
};
