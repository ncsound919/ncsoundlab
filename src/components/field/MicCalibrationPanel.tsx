/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mic Calibration Panel — Input profile compensation, pre-flight telemetry,
 * gain staging, and analog-clipping protection.
 */

import React, { useEffect, useState } from 'react';

export type MicProfileId = 'phone-builtin' | 'lavalier' | 'usb-condenser' | 'direct-line';

export interface MicProfile {
  id: MicProfileId;
  name: string;
  description: string;
  rumbleCutHz: number;
  presenceBoostDb: number;
}

export const MIC_PROFILES: MicProfile[] = [
  {
    id: 'phone-builtin',
    name: 'Smartphone Internal Mic',
    description: 'Enables 80Hz rumble cut filter to cancel handling vibrations; adds mild presence compensation.',
    rumbleCutHz: 80,
    presenceBoostDb: 2.0,
  },
  {
    id: 'lavalier',
    name: 'Wired Lavalier / Lapel',
    description: 'Speech & close-field transient tuning; 60Hz high-pass.',
    rumbleCutHz: 60,
    presenceBoostDb: 1.0,
  },
  {
    id: 'usb-condenser',
    name: 'USB / Field Condenser',
    description: 'Unprocessed flat frequency response; optimal for high-fidelity 24-bit/32-bit acoustic capture.',
    rumbleCutHz: 20,
    presenceBoostDb: 0.0,
  },
  {
    id: 'direct-line',
    name: 'Direct Line Input',
    description: 'Flat line-level capture without pre-filtering.',
    rumbleCutHz: 0,
    presenceBoostDb: 0.0,
  },
];

/** Free-space readout — a 900 MB phone must not read "~0GB free". */
function formatFreeSpace(mb: number): string {
  const safe = Math.max(0, Math.round(mb));
  if (safe >= 1024) return `~${(safe / 1024).toFixed(1)}GB free`;
  if (safe >= 10) return `~${safe}MB free`;
  return '<10MB free';
}

interface MicCalibrationPanelProps {
  selectedProfile: MicProfileId;
  onSelectProfile: (id: MicProfileId) => void;
  inputGainDb: number;
  onChangeInputGain: (gainDb: number) => void;
  softLimiterEnabled: boolean;
  onToggleSoftLimiter: (enabled: boolean) => void;
}

export default function MicCalibrationPanel({
  selectedProfile,
  onSelectProfile,
  inputGainDb,
  onChangeInputGain,
  softLimiterEnabled,
  onToggleSoftLimiter,
}: MicCalibrationPanelProps): React.ReactElement {
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [storageEstimateMb, setStorageEstimateMb] = useState<number | null>(null);

  // Read Battery API & Storage API if available on device. Both are cleaned up:
  // BatteryManager outlives this component, so an anonymous listener leaked on
  // every mount and called setState after unmount.
  useEffect(() => {
    let cancelled = false;
    let batteryRef: { level: number; addEventListener: (t: string, cb: () => void) => void; removeEventListener?: (t: string, cb: () => void) => void } | null = null;
    const onLevel = () => {
      if (!cancelled && batteryRef) setBatteryPct(Math.round(batteryRef.level * 100));
    };

    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as unknown as { getBattery: () => Promise<typeof batteryRef> })
        .getBattery()
        .then((battery) => {
          if (cancelled || !battery) return;
          batteryRef = battery;
          setBatteryPct(Math.round(battery.level * 100));
          battery.addEventListener('levelchange', onLevel);
        })
        .catch(() => undefined);
    }

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        if (cancelled) return;
        if (est.quota !== undefined && est.usage !== undefined) {
          const freeBytes = est.quota - est.usage;
          setStorageEstimateMb(Math.round(freeBytes / (1024 * 1024)));
        }
      }).catch(() => undefined);
    }

    return () => {
      cancelled = true;
      try {
        batteryRef?.removeEventListener?.('levelchange', onLevel);
      } catch {
        /* older BatteryManager implementations have no removeEventListener */
      }
    };
  }, []);

  const activeProfile = MIC_PROFILES.find((p) => p.id === selectedProfile) ?? MIC_PROFILES[0];

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0c1224] p-3 text-white">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-yellow-400">
          Hardware Calibration
        </span>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-white/50">
          {batteryPct !== null && (
            <span className={batteryPct < 20 ? 'font-bold text-red-400' : 'text-green-400'}>
              🔋 {batteryPct}%
            </span>
          )}
          {storageEstimateMb !== null && <span>💾 {formatFreeSpace(storageEstimateMb)}</span>}
        </div>
      </div>

      {/* Mic Profiles */}
      <div className="mt-1">
        <label className="text-[11px] text-white/60">Hardware Microphone Profile</label>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {MIC_PROFILES.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => onSelectProfile(profile.id)}
              aria-pressed={selectedProfile === profile.id}
              className={`min-h-14 rounded-lg border p-2 text-left transition ${
                selectedProfile === profile.id
                  ? 'border-yellow-400 bg-yellow-400/10 text-white'
                  : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20'
              }`}
            >
              <div className="truncate text-xs font-semibold">{profile.name}</div>
              <div className="text-[9px] text-white/50">{profile.rumbleCutHz > 0 ? `${profile.rumbleCutHz}Hz HPF` : 'Flat line'}</div>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-white/50 leading-relaxed">
          {activeProfile.description}
        </p>
      </div>

      {/* Gain & Anti-Clip Limiter */}
      <div className="mt-1 grid grid-cols-2 gap-3 border-t border-white/10 pt-2 text-xs">
        <div>
          <div className="flex justify-between text-white/70">
            <span>Input Gain Trim</span>
            <span className="font-semibold text-yellow-400">
              {inputGainDb >= 0 ? `+${inputGainDb.toFixed(1)}` : inputGainDb.toFixed(1)} dB
            </span>
          </div>
          <input
            type="range"
            min={-6}
            max={18}
            step={0.5}
            value={inputGainDb}
            onChange={(e) => onChangeInputGain(Number(e.target.value))}
            className="w-full accent-yellow-400 mt-1"
          />
        </div>

        <div className="flex flex-col justify-between">
          <span className="text-white/70">Anti-Clip Limiter</span>
          <button
            type="button"
            onClick={() => onToggleSoftLimiter(!softLimiterEnabled)}
            aria-pressed={softLimiterEnabled}
            className={`flex min-h-11 items-center justify-between rounded-md p-1.5 text-xs font-semibold ${
              softLimiterEnabled
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/40'
                : 'bg-white/5 text-white/40'
            }`}
          >
            <span>{softLimiterEnabled ? 'Soft Knee Active' : 'Off (Pure)'}</span>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                softLimiterEnabled ? 'bg-yellow-400' : 'bg-white/20'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
