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
      const blob = await new Promise<Blob>((res) => {
        rec.addEventListener('dataavailable', (e) => res(e.data), { once: true });
        rec.stop();
      });
      if (activeStream) {
        for (const t of activeStream.getTracks()) t.stop();
        activeStream = null;
      }
      activeRecorder = null;
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
