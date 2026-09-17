/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI provider settings (Phase 3.1).
 *
 * Configures the *non-secret* half of the AI layer: enable flag, which secret
 * source to use, the Keywire coordinates, and the LLM base URL + model. Secrets
 * (the Keywire service token and a manually entered API key) are held in
 * session memory only and are cleared on reload — this panel never writes one to
 * disk, and says so in the UI.
 */

import { useState } from 'react';
import { Check, KeyRound, Loader2, ShieldCheck, X } from 'lucide-react';
import { useAiProviderStore } from '../store/aiProviderStore';
import { createDefaultTransport, isTauriRuntime, type HttpTransport } from '../lib/ai/transport';
import { fetchKeywireSecret, KeywireError } from '../lib/ai/keywire';
import { clearSessionSecrets, hasSessionSecret, setSessionSecret } from '../lib/ai/secrets';
import { completionsUrl } from '../lib/ai/openaiCompatible';

export interface AiSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (msg: string, kind?: 'success' | 'info' | 'warn' | 'error') => void;
  /** Injectable for tests; defaults to the runtime transport. */
  transport?: HttpTransport;
}

type Status = { kind: 'idle' | 'ok' | 'error' | 'busy'; message: string };

const labelClass = 'text-[10px] font-mono uppercase tracking-widest text-slate-400';
const inputClass =
  'w-full mt-1 px-2 py-1.5 rounded-md bg-black/40 border border-slate-700/60 text-slate-100 text-xs outline-none focus:border-sky-500/60';

export function AiSettingsPanel({ isOpen, onClose, onToast, transport }: AiSettingsPanelProps) {
  const cfg = useAiProviderStore();
  const [manualKey, setManualKey] = useState('');
  const [manualSaved, setManualSaved] = useState(() => hasSessionSecret(cfg.keywire.keyName));
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });

  if (!isOpen) return null;

  const desktop = isTauriRuntime();
  const http = transport ?? createDefaultTransport();

  const saveManualKey = () => {
    setSessionSecret(cfg.keywire.keyName, manualKey.trim());
    setManualSaved(hasSessionSecret(cfg.keywire.keyName));
    onToast?.('Key held for this session only', 'success');
  };

  const testKeywire = async () => {
    setStatus({ kind: 'busy', message: 'Contacting Keywire…' });
    try {
      const value = await fetchKeywireSecret(
        http,
        { baseUrl: cfg.keywire.baseUrl, projectId: cfg.keywire.projectId, envSlug: cfg.keywire.envSlug },
        token,
        cfg.keywire.keyName
      );
      setStatus({ kind: 'ok', message: value ? 'Secret found (value not displayed).' : 'Keywire reachable.' });
    } catch (err) {
      const message = err instanceof KeywireError ? err.message : 'Keywire request failed';
      setStatus({ kind: 'error', message });
    }
  };

  const testModel = async () => {
    setStatus({ kind: 'busy', message: 'Testing model…' });
    try {
      const res = await http.request(completionsUrl(cfg.llm.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.llm.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
        timeoutMs: 15000,
      });
      setStatus(
        res.ok
          ? { kind: 'ok', message: 'Model responded.' }
          : { kind: 'error', message: `Model endpoint returned HTTP ${res.status}.` }
      );
    } catch (err) {
      setStatus({ kind: 'error', message: `Model request failed: ${(err as Error)?.message ?? 'unknown'}` });
    }
  };

  const clearSecrets = () => {
    clearSessionSecrets();
    setManualKey('');
    setManualSaved(false);
    setToken('');
    setStatus({ kind: 'ok', message: 'Session secrets cleared.' });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-label="AI provider settings"
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700/60 bg-[#0c0c10]/95 p-5 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-sky-400" />
            <h2 className="text-sm font-bold text-slate-100">AI Provider</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-200">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => cfg.setEnabled(e.target.checked)} />
          Enable AI features
        </label>
        <p className="text-[11px] text-slate-500 -mt-3">
          Off by default. With this off, and with no local services running, SoundLab stays fully offline.
        </p>

        <div>
          <div className={labelClass}>Secret source</div>
          <select
            aria-label="Secret source"
            className={inputClass}
            value={cfg.secretSource}
            onChange={(e) => cfg.setSecretSource(e.target.value as typeof cfg.secretSource)}
          >
            <option value="manual">Manual — paste for this session</option>
            <option value="keywire">Keywire vault</option>
            <option value="none">None</option>
          </select>
        </div>

        {cfg.secretSource === 'manual' && (
          <div className="space-y-2">
            <div className={labelClass}>API key (session only)</div>
            <div className="flex gap-2">
              <input
                type="password"
                aria-label="API key"
                className={inputClass}
                value={manualKey}
                placeholder="sk-…"
                onChange={(e) => setManualKey(e.target.value)}
              />
              <button
                onClick={saveManualKey}
                className="mt-1 px-3 rounded-md bg-sky-600/80 hover:bg-sky-500 text-white text-xs"
              >
                Hold
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              {manualSaved ? 'A key is held for this session.' : 'No key saved. Nothing is written to disk.'}
            </p>
          </div>
        )}

        {cfg.secretSource === 'keywire' && (
          <div className="space-y-3">
            {!desktop && (
              <p className="text-[11px] text-amber-400/90">
                Keywire reads require the desktop build (requests are made from the app core, not the browser).
              </p>
            )}
            <div>
              <div className={labelClass}>Keywire URL</div>
              <input
                aria-label="Keywire URL"
                className={inputClass}
                value={cfg.keywire.baseUrl}
                onChange={(e) => cfg.setKeywire({ baseUrl: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className={labelClass}>Project</div>
                <input
                  aria-label="Keywire project"
                  className={inputClass}
                  value={cfg.keywire.projectId}
                  onChange={(e) => cfg.setKeywire({ projectId: e.target.value })}
                />
              </div>
              <div>
                <div className={labelClass}>Environment</div>
                <input
                  aria-label="Keywire environment"
                  className={inputClass}
                  value={cfg.keywire.envSlug}
                  onChange={(e) => cfg.setKeywire({ envSlug: e.target.value })}
                />
              </div>
            </div>
            <div className={labelClass}>Secret name</div>
            <input
              aria-label="Keywire secret name"
              className={inputClass}
              value={cfg.keywire.keyName}
              onChange={(e) => cfg.setKeywire({ keyName: e.target.value })}
            />
            <div className={labelClass}>Service token (session only)</div>
            <div className="flex gap-2">
              <input
                type="password"
                aria-label="Keywire service token"
                className={inputClass}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button
                onClick={testKeywire}
                className="mt-1 px-3 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-xs whitespace-nowrap"
              >
                Test
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className={labelClass}>Model base URL</div>
            <input
              aria-label="Model base URL"
              className={inputClass}
              value={cfg.llm.baseUrl}
              onChange={(e) => cfg.setLlm({ baseUrl: e.target.value })}
            />
          </div>
          <div>
            <div className={labelClass}>Model</div>
            <input
              aria-label="Model"
              className={inputClass}
              value={cfg.llm.model}
              onChange={(e) => cfg.setLlm({ model: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={testModel}
            disabled={!cfg.llm.baseUrl || !cfg.llm.model}
            className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-xs"
          >
            Test model
          </button>
          <button
            onClick={clearSecrets}
            className="px-3 py-1.5 rounded-md border border-slate-700/60 text-slate-300 text-xs hover:bg-slate-800"
          >
            Clear session secrets
          </button>
        </div>

        {status.kind !== 'idle' && (
          <div
            role="status"
            className={`flex items-center gap-2 text-[11px] ${
              status.kind === 'error' ? 'text-rose-400' : status.kind === 'ok' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            {status.kind === 'busy' && <Loader2 size={12} className="animate-spin" />}
            {status.kind === 'ok' && <Check size={12} />}
            {status.kind === 'error' && <X size={12} />}
            <span>{status.message}</span>
          </div>
        )}

        <p className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <KeyRound size={10} /> Keys are never written to disk, IndexedDB, or project files.
        </p>
      </div>
    </div>
  );
}

export default AiSettingsPanel;
