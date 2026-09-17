/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * React hook that owns the Web MIDI connection for the controller panel:
 * enables the service, normalizes messages, runs MIDI-learn, and dispatches
 * mapped actions. The app-specific work lives in the `ControllerHandlers`
 * passed in, so this hook stays a thin transport.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createMidiService, type MidiInputInfo, type MidiMessageEvent, type MidiService } from '../../lib/midiService';
import { bindingValue, findBindings, normalizeRaw } from '../../lib/controller/mapping';
import { resolveSectionBinding } from '../../lib/controller/sectionMap';
import { dispatchAction, type ControllerHandlers } from '../../lib/controller/actions';
import { bindingIsOn, toIncomingMessage } from '../../lib/controller/midiBridge';
import { useControllerStore } from '../../store/controllerStore';

export interface UseControllerMidiResult {
  supported: boolean;
  active: boolean;
  inputs: MidiInputInfo[];
  error: string | null;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  toggle: () => Promise<void>;
}

export function useControllerMidi(handlers: ControllerHandlers): UseControllerMidiResult {
  const handlersRef = useRef<ControllerHandlers>(handlers);
  handlersRef.current = handlers;

  const svcRef = useRef<MidiService | null>(null);
  if (svcRef.current === null) svcRef.current = createMidiService();

  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(false);
  const [inputs, setInputs] = useState<MidiInputInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const enabledInputIds = useControllerStore((s) => s.profile.enabledInputIds);
  const filterKey = enabledInputIds.join(',');

  useEffect(() => {
    setSupported(svcRef.current?.isSupported() ?? false);
  }, []);

  const onMessage = useCallback((event: MidiMessageEvent) => {
    const store = useControllerStore.getState();
    const msg = toIncomingMessage(event);
    // Learn first (also records lastMessage), then dispatch against the
    // possibly-just-updated profile.
    store.ingestMessage(msg);
    const fresh = useControllerStore.getState();
    const matches = findBindings(fresh.profile, msg);
    for (const { controlKey, binding } of matches) {
      // Section follow: in beat mode the visible section may re-target bank-0
      // knobs/faders (with their own range). Learn still edits the underlying
      // profile binding, which rules Beat Studio + unfollowed sections.
      const effective = resolveSectionBinding({
        mode: fresh.mode,
        section: fresh.section,
        controlKey,
        binding,
      }) ?? binding;
      dispatchAction(effective.action, {
        value: bindingValue(effective, msg.value),
        unit: normalizeRaw(msg.value, effective.invert),
        raw: msg.value,
        on: bindingIsOn(effective, msg),
        handlers: handlersRef.current,
      });
    }
  }, []);

  const enable = useCallback(async () => {
    const svc = svcRef.current!;
    if (!svc.isSupported()) {
      setError('This browser has no Web MIDI support. Try Chrome, Edge, or the desktop app.');
      setActive(false);
      return false;
    }
    const ok = await svc.subscribe(
      { onMessage, onStateChange: setInputs },
      { inputIds: useControllerStore.getState().profile.enabledInputIds }
    );
    setActive(ok);
    setError(ok ? null : 'Web MIDI permission denied or unavailable.');
    return ok;
  }, [onMessage]);

  const disable = useCallback(async () => {
    await svcRef.current?.disable();
    setActive(false);
    setInputs([]);
  }, []);

  const toggle = useCallback(async () => {
    if (active) await disable();
    else await enable();
  }, [active, disable, enable]);

  // Re-apply the device filter whenever the user changes which inputs are used.
  useEffect(() => {
    svcRef.current?.setInputFilter(enabledInputIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    return () => {
      svcRef.current?.disable().catch(() => {});
    };
  }, []);

  return { supported, active, inputs, error, enable, disable, toggle };
}
