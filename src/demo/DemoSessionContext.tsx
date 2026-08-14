/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DemoStatus,
  beginDemoSession,
  expireDemoSession,
  formatCountdown,
  isDesktopBuild,
  readDemoStart,
  remainingMs,
  resolveActiveSession,
  unlockDemoSession,
} from '../lib/demoGate';
import { DEMO_SESSION_MS } from '../lib/demoConfig';

function bootstrapDemo(): { status: DemoStatus; remaining: number } {
  if (isDesktopBuild()) return { status: 'purchased', remaining: 0 };
  const res = resolveActiveSession();
  return {
    status: res.status,
    remaining: res.status === 'fresh' ? DEMO_SESSION_MS : res.remaining,
  };
}

interface DemoSessionValue {
  enabled: boolean;
  status: DemoStatus;
  remaining: number;
  countdown: string;
  locked: boolean;
  showWelcome: boolean;
  start: () => void;
  unlock: () => void;
}

const DemoSessionContext = createContext<DemoSessionValue | null>(null);

export function DemoSessionProvider({ children }: { children: React.ReactNode }) {
  const enabled = useMemo(() => !isDesktopBuild(), []);
  const [boot] = useState(bootstrapDemo);
  const [status, setStatus] = useState<DemoStatus>(boot.status);
  const [remaining, setRemaining] = useState<number>(boot.remaining);

  useEffect(() => {
    if (!enabled || status !== 'active') return;
    const timer = setInterval(() => {
      const start = readDemoStart();
      if (start === null) {
        expireDemoSession();
        setStatus('expired');
        setRemaining(0);
        return;
      }
      const rem = remainingMs(start);
      if (rem <= 0) {
        expireDemoSession();
        setStatus('expired');
        setRemaining(0);
      } else {
        setRemaining(rem);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, status]);

  const start = useCallback(() => {
    beginDemoSession();
    setStatus('active');
    setRemaining(DEMO_SESSION_MS);
  }, []);

  const unlock = useCallback(() => {
    unlockDemoSession();
    setStatus('purchased');
  }, []);

  const value: DemoSessionValue = {
    enabled,
    status,
    remaining,
    countdown: formatCountdown(remaining),
    locked: enabled && status === 'expired',
    showWelcome: enabled && status === 'fresh',
    start,
    unlock,
  };

  return <DemoSessionContext.Provider value={value}>{children}</DemoSessionContext.Provider>;
}

export function useDemoSession(): DemoSessionValue {
  const ctx = useContext(DemoSessionContext);
  if (!ctx) {
    throw new Error('useDemoSession must be used within a DemoSessionProvider');
  }
  return ctx;
}
