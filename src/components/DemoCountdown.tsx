/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Timer } from 'lucide-react';
import { useDemoSession } from '../demo/DemoSessionContext';
import { PURCHASE_URL, DEMO_PRICE_DISPLAY, DEMO_PRODUCT_NAME } from '../lib/demoConfig';

export function DemoCountdown() {
  const { enabled, status, countdown } = useDemoSession();
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!enabled || status !== 'active') return null;

  return (
    <>
      <button
        onClick={() => setShowUpgrade(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 text-[10px] font-black uppercase tracking-wider hover:bg-yellow-500/20 transition-all shrink-0 cursor-pointer"
        title={`Free demo session — get ${DEMO_PRODUCT_NAME} for ${DEMO_PRICE_DISPLAY} (one-time)`}
      >
        <Timer size={12} />
        <span>Demo</span>
        <span className="font-mono font-black tabular-nums">{countdown}</span>
      </button>

      {showUpgrade && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setShowUpgrade(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Upgrade to the full app"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-blue-500/40 bg-[#0c0c10] p-6 shadow-[0_0_40px_rgba(37,99,235,0.25)]"
          >
            <div className="text-xs font-mono font-black uppercase tracking-widest text-yellow-400 mb-2">
              Demo session active
            </div>
            <h2 className="text-xl font-fastblaze tracking-wide text-white mb-2">
              {DEMO_PRODUCT_NAME} — {DEMO_PRICE_DISPLAY} one-time
            </h2>
            <p className="text-sm text-slate-300 mb-5">
              You have <strong className="text-white font-mono">{countdown}</strong> left in the free
              demo. Download the full app for a one-time {DEMO_PRICE_DISPLAY} — no accounts, no
              memberships, no subscriptions. Yours forever.
            </p>
            <div className="flex flex-col gap-2">
              <a
                href={PURCHASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-yellow-400 px-4 py-3 text-black text-sm font-black uppercase tracking-wider hover:opacity-95 transition-all"
              >
                Get the full app — {DEMO_PRICE_DISPLAY}
              </a>
              <button
                onClick={() => setShowUpgrade(false)}
                className="rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
              >
                Keep demoing
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
