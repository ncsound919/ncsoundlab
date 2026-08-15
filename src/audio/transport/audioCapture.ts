export interface AudioCapture {
  isSupported(): boolean;
  start(): Promise<MediaStream>;
  stop(_stream?: MediaStream): Promise<Blob>;
  decodeBlobToBuffer(blob: Blob, ctx: BaseAudioContext): Promise<AudioBuffer>;
  dispose(): void;
}

export function isMediaRecorderSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
}

export function createAudioCapture(): AudioCapture {
  let activeStream: MediaStream | null = null;
  let activeRecorder: MediaRecorder | null = null;

  return {
    isSupported: isMediaRecorderSupported,

    async start() {
      if (!isMediaRecorderSupported()) throw new Error('MediaRecorder not available');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStream = stream;
      const rec = new MediaRecorder(stream);
      activeRecorder = rec;
      rec.start();
      return stream;
    },

    async stop(_stream) {
      if (!activeRecorder) throw new Error('No active recorder');
      const rec = activeRecorder;
      const blob = await new Promise<Blob>((res, rej) => {
        const onError = () => rej(new Error('MediaRecorder error during stop'));
        const off = () => {
          if (typeof rec.removeEventListener === 'function') {
            rec.removeEventListener('error', onError);
          }
        };
        // Safety net: if the recorder never emits dataavailable (already
        // stopped, never started, or a browser quirk), fail rather than hang
        // the caller with the mic left active.
        const hangTimer = setTimeout(() => {
          off();
          rej(new Error('MediaRecorder stop timed out'));
        }, 3000);
        if (typeof rec.addEventListener === 'function') {
          rec.addEventListener('error', onError, { once: true });
          rec.addEventListener('dataavailable', (e: BlobEvent) => {
            clearTimeout(hangTimer);
            off();
            res(e.data);
          }, { once: true });
          rec.addEventListener('stop', () => clearTimeout(hangTimer), { once: true });
        }
        try {
          rec.stop();
        } catch (err) {
          clearTimeout(hangTimer);
          off();
          rej(err as Error);
        }
      }).finally(() => {
        if (activeStream) {
          for (const t of activeStream.getTracks()) t.stop();
          activeStream = null;
        }
        activeRecorder = null;
      });
      return blob;
    },

    async decodeBlobToBuffer(blob, ctx) {
      const arr = await blob.arrayBuffer();
      return await ctx.decodeAudioData(arr);
    },

    dispose() {
      if (activeStream) {
        for (const t of activeStream.getTracks()) t.stop();
        activeStream = null;
      }
      activeRecorder = null;
    },
  };
}

/** Slice a buffer into N equal-length pads. */
export function sliceBufferIntoPads(buffer: AudioBuffer, n: number): AudioBuffer[] {
  const out: AudioBuffer[] = [];
  const sliceLen = Math.floor(buffer.length / n);
  for (let i = 0; i < n; i++) {
    const start = i * sliceLen;
    const end = i === n - 1 ? buffer.length : start + sliceLen;
    const newBuf = new AudioBuffer({
      length: end - start,
      sampleRate: buffer.sampleRate,
      numberOfChannels: buffer.numberOfChannels,
    });
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      newBuf.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
    }
    out.push(newBuf);
  }
  return out;
}
