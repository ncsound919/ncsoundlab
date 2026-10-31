/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Capture planning for the Android recorder.
 *
 * This module is pure policy: the native layer reports what the device can do
 * (AudioRecord properties, connected devices, free storage, permissions) and
 * this code decides what to record, what to refuse and what to warn about. That
 * split keeps the decisions testable without a phone.
 *
 * Rules that come from the platform, not from taste:
 *
 *  - `UNPROCESSED` is device-dependent (OEM voice processing is compiled in), so
 *    it must be probed at runtime and fallen back from with a warning.
 *  - A Bluetooth microphone drops to a narrowband codec, which is not field
 *    recording; it is refused for capture.
 *  - A capture must run in a foreground service (`microphone|dataSync`) or
 *    Android kills it when the screen turns off, and API 34+ demands both the
 *    declared type and the runtime permission.
 */

import { bytesPerSecond, wavByteSize, type WavSampleFormat } from './wavCodec';

export type CaptureSourceType = 'UNPROCESSED' | 'MIC' | 'VOICE_RECOGNITION' | 'CAMCORDER';
export type DeviceKind = 'builtin' | 'usb' | 'bluetooth' | 'headset' | 'unknown';

export interface AudioDeviceLike {
  id: string;
  name?: string;
  kind: DeviceKind;
  isMicrophone: boolean;
  /** Sample rates the device reports (Hz). */
  sampleRates?: number[];
  channels?: number;
}

/** What the native layer measured about this device, before policy is applied. */
export interface CaptureCapabilities {
  /** `AudioRecord.getProperty(UNPROCESSED_SOURCE_SUPPORTED)` == true. */
  unprocessedSupported: boolean;
  /** `ENCODING_PCM_FLOAT` is available on this device (API 21+, some OEMs lie). */
  floatCaptureSupported?: boolean;
  /** Rates AudioRecord accepts, e.g. [44100, 48000]. */
  nativeSampleRates: number[];
  /** Microphone currently routed for capture. */
  device?: AudioDeviceLike;
  /** Free bytes on the target volume. */
  freeBytes?: number;
  /** RECORD_AUDIO already granted. */
  permissionGranted?: boolean;
  /** Battery percentage, for the "long session" warning. */
  batteryPct?: number;
}

export interface CapturePreferences {
  preferredSampleRate?: number;
  channels?: 1 | 2;
  format?: WavSampleFormat;
}

export interface CaptureConfig {
  sampleRateHz: number;
  channels: 1 | 2;
  format: WavSampleFormat;
  sourceType: CaptureSourceType;
  /** Android foreground service types: `microphone` + `dataSync`. */
  serviceTypes: string[];
  /** Manifest permissions the build must declare. */
  permissions: string[];
  bytesPerSecond: number;
}

export type CaptureIssueCode =
  | 'UNPROCESSED_UNAVAILABLE'
  | 'BLUETOOTH_MIC'
  | 'USB_MIC_LATENCY'
  | 'NO_MICROPHONE'
  | 'SAMPLE_RATE_SUBSTITUTED'
  | 'FLOAT_UNSUPPORTED'
  | 'PERMISSION_MISSING'
  | 'LOW_STORAGE'
  | 'LOW_BATTERY'
  | 'NO_DEVICE_INFO';

export interface CaptureIssue {
  code: CaptureIssueCode;
  severity: 'block' | 'warn' | 'info';
  message: string;
}

export interface CapturePlan {
  config: CaptureConfig;
  issues: CaptureIssue[];
  /** False when at least one issue is a blocker. */
  canStart: boolean;
  /** Recording time the free storage supports, in seconds (Infinity when unknown). */
  maxSeconds: number;
}

export const ANDROID_CAPTURE_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.POST_NOTIFICATIONS',
] as const;

/** Declared in the manifest as `android:foregroundServiceType`. */
export const ANDROID_FOREGROUND_SERVICE_TYPES = ['microphone', 'dataSync'] as const;

/** Default headroom kept free on the volume: 250 MB. */
const STORAGE_HEADROOM_BYTES = 250 * 1024 * 1024;

/** Below this battery level a long take is at risk. */
const LOW_BATTERY_PCT = 15;

/**
 * Device policy. A Bluetooth microphone is refused (narrowband codec); USB is
 * allowed but flagged, because a class-compliant interface's input latency is
 * too high for monitoring until the phase-2 native path lands.
 */
export function classifyDevice(device: AudioDeviceLike | undefined): {
  usable: boolean;
  code?: CaptureIssueCode;
  reason?: string;
} {
  if (!device) return { usable: true };
  if (!device.isMicrophone) {
    return {
      usable: false,
      code: 'NO_MICROPHONE',
      reason: `${device.name ?? device.id} is not a capture device`,
    };
  }
  if (device.kind === 'bluetooth') {
    return {
      usable: false,
      code: 'BLUETOOTH_MIC',
      reason:
        'Bluetooth microphones negotiate a narrowband codec — not usable for field capture. Use the phone mic or a wired input.',
    };
  }
  if (device.kind === 'usb') {
    return {
      usable: true,
      code: 'USB_MIC_LATENCY',
      reason:
        'USB input is recorded, but monitoring its latency is not compensated until the USB audio phase lands.',
    };
  }
  return { usable: true };
}

const pickSampleRate = (available: number[], preferred?: number): { hz: number; substituted: boolean } => {
  const rates = available.filter((r) => Number.isFinite(r) && r >= 8000);
  if (rates.length === 0) return { hz: preferred ?? 48000, substituted: false };
  if (preferred && rates.includes(preferred)) return { hz: preferred, substituted: false };
  // Prefer 48 kHz, then 44.1, then the highest supported rate.
  for (const candidate of [48000, 44100, 96000]) {
    if (rates.includes(candidate)) return { hz: candidate, substituted: candidate !== preferred };
  }
  const highest = Math.max(...rates);
  return { hz: highest, substituted: highest !== preferred };
};

/**
 * Build the capture plan: source, rate, format, service types, and every reason
 * the session should not start.
 */
export function planCapture(
  capabilities: CaptureCapabilities,
  preferences: CapturePreferences = {}
): CapturePlan {
  const issues: CaptureIssue[] = [];
  const preferredRate = preferences.preferredSampleRate ?? 48000;
  const { hz, substituted } = pickSampleRate(capabilities.nativeSampleRates, preferredRate);

  const deviceVerdict = classifyDevice(capabilities.device);
  if (!deviceVerdict.usable && deviceVerdict.code) {
    issues.push({
      code: deviceVerdict.code,
      severity: deviceVerdict.code === 'BLUETOOTH_MIC' || deviceVerdict.code === 'NO_MICROPHONE' ? 'block' : 'warn',
      message: deviceVerdict.reason ?? 'Unusable input device',
    });
  } else if (deviceVerdict.code === 'USB_MIC_LATENCY') {
    issues.push({ code: deviceVerdict.code, severity: 'info', message: deviceVerdict.reason ?? '' });
  } else if (!capabilities.device) {
    issues.push({
      code: 'NO_DEVICE_INFO',
      severity: 'info',
      message: 'No device details from the native layer — assuming the built-in microphone.',
    });
  }

  const source: CaptureSourceType = capabilities.unprocessedSupported ? 'UNPROCESSED' : 'MIC';
  if (!capabilities.unprocessedSupported) {
    issues.push({
      code: 'UNPROCESSED_UNAVAILABLE',
      severity: 'warn',
      message:
        'This device does not expose an unprocessed source — recording the processed microphone path. Disable in-call/voice effects in system settings if the take sounds filtered.',
    });
  }

  const requestedFormat: WavSampleFormat = preferences.format ?? 'float32';
  let format = requestedFormat;
  if (requestedFormat === 'float32' && capabilities.floatCaptureSupported === false) {
    format = 'int24';
    issues.push({
      code: 'FLOAT_UNSUPPORTED',
      severity: 'info',
      message: 'Float capture unavailable; recording 24-bit PCM instead.',
    });
  }

  if (substituted && preferences.preferredSampleRate) {
    issues.push({
      code: 'SAMPLE_RATE_SUBSTITUTED',
      severity: 'info',
      message: `Sample rate ${preferences.preferredSampleRate} Hz is not supported here; using ${hz} Hz.`,
    });
  }

  if (capabilities.permissionGranted === false) {
    issues.push({
      code: 'PERMISSION_MISSING',
      severity: 'block',
      message: 'RECORD_AUDIO has not been granted.',
    });
  }

  const channels = preferences.channels ?? 1;
  const config: CaptureConfig = {
    sampleRateHz: hz,
    channels,
    format,
    sourceType: source,
    serviceTypes: [...ANDROID_FOREGROUND_SERVICE_TYPES],
    permissions: [...ANDROID_CAPTURE_PERMISSIONS],
    bytesPerSecond: bytesPerSecond(channels, hz, format),
  };

  let maxSeconds = Infinity;
  if (typeof capabilities.freeBytes === 'number') {
    const usableBytes = Math.max(0, capabilities.freeBytes - STORAGE_HEADROOM_BYTES);
    maxSeconds = usableBytes / config.bytesPerSecond;
    if (maxSeconds < 60) {
      issues.push({
        code: 'LOW_STORAGE',
        severity: 'block',
        message: `Only ${maxSeconds.toFixed(0)} s of capture space left after the ${(STORAGE_HEADROOM_BYTES / 1048576).toFixed(0)} MB safety margin.`,
      });
    } else if (maxSeconds < 600) {
      issues.push({
        code: 'LOW_STORAGE',
        severity: 'warn',
        message: `About ${(maxSeconds / 60).toFixed(0)} minutes of capture space left.`,
      });
    }
  }

  if (typeof capabilities.batteryPct === 'number' && capabilities.batteryPct < LOW_BATTERY_PCT) {
    issues.push({
      code: 'LOW_BATTERY',
      severity: 'warn',
      message: `Battery at ${capabilities.batteryPct}% — long takes will not survive.`,
    });
  }

  return {
    config,
    issues,
    canStart: !issues.some((i) => i.severity === 'block'),
    maxSeconds,
  };
}

/** Storage a take of this length needs, header included. */
export function estimateTakeBytes(seconds: number, config: CaptureConfig): number {
  const frames = Math.max(0, Math.round(seconds * config.sampleRateHz));
  return wavByteSize(frames, config.channels, config.format);
}

/** Human-readable summary for the capture screen. */
export function describePlan(config: CaptureConfig): string {
  const rate = `${(config.sampleRateHz / 1000).toFixed(1)} kHz`;
  const depth =
    config.format === 'float32'
      ? '32-bit float'
      : config.format === 'int24'
        ? '24-bit'
        : config.format === 'int32'
          ? '32-bit int'
          : '16-bit';
  return `${rate} · ${config.channels === 1 ? 'mono' : 'stereo'} · ${depth} · ${config.sourceType}`;
}
