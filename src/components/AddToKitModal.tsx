import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SampleCategory, SoundKit } from '../types';
import {
  PackagePlus,
  Plus,
  Check,
  X,
  Sparkles,
  FolderPlus,
  Settings,
  Tag,
  Shield,
} from 'lucide-react';

export interface AddToKitExtraOptions {
  sampleRate?: string;
  bitDepth?: string;
  stereoMode?: 'mono' | 'stereo';
  normalize?: boolean;
  rootKey?: string;
  bpm?: number;
  creator?: string;
  license?: string;
  format?: 'wav' | 'aiff' | 'flac';
  peakCeilingDb?: number;
  trimSilence?: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  tags?: string[];
  notes?: string;
  overwriteMode?: 'duplicate' | 'replace' | 'skip';
  color?: string;
}

interface AddToKitModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableKits: SoundKit[];
  defaultSampleName?: string;
  onConfirmAdd: (
    targetKitId: string | 'new',
    sampleName: string,
    category: SampleCategory,
    newKitTitle?: string,
    extraOptions?: AddToKitExtraOptions
  ) => void;
}

const CATEGORIES: SampleCategory[] = [
  'Atmospheres',
  'Impacts',
  'Transitions',
  'Glitches',
  'FX Elements',
  'Percussive FX',
  'Melodic FX',
  'Kick',
  'Snare',
  'HiHat',
  'Clap',
  '808',
  'Perc',
  'Vox',
  'FX',
  'Melody',
  'Bass',
];

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'N/A'] as const;
const SAMPLE_RATES = ['44100', '48000', '96000'] as const;
const BIT_DEPTHS = ['16', '24', '32'] as const;
const LICENSES = ['Royalty-Free', 'Attribution', 'Commercial', 'Creative Commons'] as const;
const FORMATS = ['wav', 'aiff', 'flac'] as const;
const OVERWRITE_MODES = ['duplicate', 'replace', 'skip'] as const;
const COLORS = [
  '#10B981',
  '#06B6D4',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#F472B6',
  '#84CC16',
  '#EAB308',
] as const;

type ErrorState = Partial<{
  sampleName: string;
  newKitTitle: string;
  bpm: string;
  creator: string;
  tags: string;
}>;

type FormState = {
  selectedKitId: string | 'new';
  sampleName: string;
  category: SampleCategory;
  newKitTitle: string;
  sampleRate: string;
  bitDepth: string;
  stereoMode: 'mono' | 'stereo';
  normalize: boolean;
  rootKey: string;
  bpm: number;
  creator: string;
  license: string;
  format: 'wav' | 'aiff' | 'flac';
  peakCeilingDb: number;
  trimSilence: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  notes: string;
  tagsInput: string;
  overwriteMode: 'duplicate' | 'replace' | 'skip';
  color: string;
};

const DEFAULT_CREATOR = 'Echosmith Sound Lab';

const createInitialState = (
  availableKits: SoundKit[],
  defaultSampleName?: string
): FormState => ({
  selectedKitId: availableKits.length > 0 ? availableKits[0].id : 'new',
  sampleName: defaultSampleName || 'CUSTOM_ONE_SHOT',
  category: '808',
  newKitTitle: 'MY CUSTOM SOUND KIT',
  sampleRate: '48000',
  bitDepth: '24',
  stereoMode: 'stereo',
  normalize: true,
  rootKey: 'C',
  bpm: 120,
  creator: DEFAULT_CREATOR,
  license: 'Royalty-Free',
  format: 'wav',
  peakCeilingDb: -0.1,
  trimSilence: true,
  fadeInMs: 0,
  fadeOutMs: 8,
  notes: '',
  tagsInput: '',
  overwriteMode: 'duplicate',
  color: COLORS[0],
});

export const normalizeName = (value: string) =>
  value
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_\-#]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

export const parseTags = (input: string) =>
  Array.from(
    new Set(
      input
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);

/**
 * Pure form validation. Returns a map of field → error message; an empty map
 * means the form is valid. Extracted for unit testing.
 */
export function validateSampleForm(
  form: Pick<FormState, 'sampleName' | 'selectedKitId' | 'newKitTitle' | 'bpm' | 'creator'>,
  parsedTags: string[]
): ErrorState {
  const nextErrors: ErrorState = {};
  const cleanName = normalizeName(form.sampleName);

  if (!cleanName) {
    nextErrors.sampleName = 'Sample name is required.';
  } else if (cleanName.length < 3) {
    nextErrors.sampleName = 'Use at least 3 valid characters.';
  }

  if (form.selectedKitId === 'new' && !form.newKitTitle.trim()) {
    nextErrors.newKitTitle = 'New kit title is required.';
  }

  if (!Number.isFinite(form.bpm) || form.bpm < 20 || form.bpm > 300) {
    nextErrors.bpm = 'BPM must be between 20 and 300.';
  }

  if (!form.creator.trim()) {
    nextErrors.creator = 'Creator name is required.';
  }

  if (parsedTags.length > 12) {
    nextErrors.tags = 'Use 12 tags or fewer.';
  }

  return nextErrors;
}

export const AddToKitModal: React.FC<AddToKitModalProps> = ({
  isOpen,
  onClose,
  availableKits,
  defaultSampleName,
  onConfirmAdd,
}) => {
  const [form, setForm] = useState<FormState>(() =>
    createInitialState(availableKits, defaultSampleName)
  );
  const [errors, setErrors] = useState<ErrorState>({});
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;

  const panelRef = useRef<HTMLDivElement>(null);
  const sampleNameRef = useRef<HTMLInputElement>(null);
  const successTimeoutRef = useRef<number | null>(null);
  const wasOpenRef = useRef(false);

  // Reset the form ONLY when the modal transitions from closed → open. Keeping
  // this keyed on isOpen alone prevents the parent's re-renders (new
  // onClose/defaultSampleName identities every render) from wiping the user's
  // in-progress edits and re-focusing the name field mid-edit.
  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!justOpened) return;

    setForm(createInitialState(availableKits, defaultSampleName));
    setErrors({});
    setIsSuccess(false);
    setIsSubmitting(false);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      sampleNameRef.current?.focus();
      sampleNameRef.current?.select();
    }, 20);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(focusTimer);
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!availableKits.some((k) => k.id === form.selectedKitId) && form.selectedKitId !== 'new') {
      setForm((prev) => ({
        ...prev,
        selectedKitId: availableKits.length > 0 ? availableKits[0].id : 'new',
      }));
    }
  }, [availableKits, form.selectedKitId]);

  const selectedKit = useMemo(
    () => availableKits.find((kit) => kit.id === form.selectedKitId),
    [availableKits, form.selectedKitId]
  );

  const parsedTags = useMemo(() => parseTags(form.tagsInput), [form.tagsInput]);

  const destinationPreview = useMemo(() => {
    const target =
      form.selectedKitId === 'new'
        ? normalizeName(form.newKitTitle || 'NEW_KIT')
        : normalizeName(selectedKit?.title || 'EXISTING_KIT');

    const name = normalizeName(form.sampleName || 'UNTITLED_SAMPLE');
    return `${target}/${form.category}/${name}.${form.format}`;
  }, [form.selectedKitId, form.newKitTitle, selectedKit, form.sampleName, form.category, form.format]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addSuggestedTag = (tag: string) => {
    const nextTags = Array.from(new Set([...parsedTags, tag])).slice(0, 12);
    updateField('tagsInput', nextTags.join(', '));
  };

  const validate = (): ErrorState => validateSampleForm(form, parsedTags);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);

    const cleanedSampleName = normalizeName(form.sampleName);
    const cleanedKitTitle = normalizeName(form.newKitTitle || 'MY_CUSTOM_SOUND_KIT');

    onConfirmAdd(
      form.selectedKitId,
      cleanedSampleName,
      form.category,
      form.selectedKitId === 'new' ? cleanedKitTitle : undefined,
      {
        sampleRate: form.sampleRate,
        bitDepth: form.bitDepth,
        stereoMode: form.stereoMode,
        normalize: form.normalize,
        rootKey: form.rootKey === 'N/A' ? undefined : form.rootKey,
        bpm: form.bpm,
        creator: form.creator.trim(),
        license: form.license,
        format: form.format,
        peakCeilingDb: form.normalize ? form.peakCeilingDb : undefined,
        trimSilence: form.trimSilence,
        fadeInMs: form.fadeInMs,
        fadeOutMs: form.fadeOutMs,
        tags: parsedTags,
        notes: form.notes.trim() || undefined,
        overwriteMode: form.overwriteMode,
        color: form.color,
      }
    );

    setIsSuccess(true);
    successTimeoutRef.current = window.setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in select-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="bg-[#0c0c0f] border border-[#232328] rounded-2xl w-full max-w-3xl p-6 shadow-2xl relative overflow-hidden text-white font-sans max-h-[90vh] overflow-y-auto"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" />

        <div className="flex items-center justify-between pb-4 border-b border-[#1f1f23] mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3
                id={titleId}
                className="text-sm font-extrabold uppercase tracking-widest text-white"
              >
                Finalize & Export One-Shot
              </h3>
              <p
                id={descriptionId}
                className="text-[10px] text-gray-500"
              >
                Configure export settings, metadata, tags, and destination before saving to a sound kit.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close add to kit modal"
            className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center animate-bounce">
              <Check className="w-7 h-7" />
            </div>
            <h4 className="text-base font-bold text-emerald-400 uppercase tracking-wide">
              One-Shot Successfully Finalized!
            </h4>
            <p className="text-xs text-gray-400">
              "{normalizeName(form.sampleName)}" has been prepared and added to your library.
            </p>
            <p className="text-[10px] text-gray-500 font-mono">{destinationPreview}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="space-y-4 xl:col-span-1">
                <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-[#1c1c20]">
                  <Tag className="w-3.5 h-3.5" />
                  Core Identity
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Target Sound Kit
                  </label>
                  <select
                    value={form.selectedKitId}
                    onChange={(e) => updateField('selectedKitId', e.target.value as string | 'new')}
                    className="w-full bg-[#141417] border border-[#222226] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                  >
                    {availableKits.map((kit) => (
                      <option key={kit.id} value={kit.id}>
                        {kit.title} ({kit.samples.length} Samples)
                      </option>
                    ))}
                    <option value="new">+ Create New Sound Kit...</option>
                  </select>
                </div>

                {form.selectedKitId === 'new' && (
                  <div className="space-y-1.5 bg-orange-500/5 border border-orange-500/20 p-3 rounded-xl animate-fade-in">
                    <label className="text-[10px] font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1">
                      <FolderPlus className="w-3 h-3" />
                      New Sound Kit Title
                    </label>
                    <input
                      type="text"
                      value={form.newKitTitle}
                      onChange={(e) => updateField('newKitTitle', e.target.value)}
                      placeholder="e.g. OBSIDIAN ANALOG DRUMS"
                      className="w-full bg-[#161618] border border-[#333] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 font-bold"
                    />
                    {errors.newKitTitle && (
                      <p className="text-[10px] text-red-400">{errors.newKitTitle}</p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Sample Name
                  </label>
                  <input
                    ref={sampleNameRef}
                    type="text"
                    value={form.sampleName}
                    onChange={(e) => updateField('sampleName', e.target.value)}
                    required
                    className="w-full bg-[#141417] border border-[#222226] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold font-mono"
                  />
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-500">Preview: {normalizeName(form.sampleName || '') || 'UNTITLED_SAMPLE'}</span>
                    <button
                      type="button"
                      onClick={() => updateField('sampleName', normalizeName(form.sampleName))}
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      Normalize Name
                    </button>
                  </div>
                  {errors.sampleName && (
                    <p className="text-[10px] text-red-400">{errors.sampleName}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Sample Category
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => updateField('category', cat)}
                        className={`py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all ${
                          form.category === cat
                            ? 'bg-emerald-500 text-black font-extrabold shadow-md shadow-emerald-500/10'
                            : 'bg-[#141417] text-gray-400 hover:text-white border border-[#222226]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Overwrite Behavior
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {OVERWRITE_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateField('overwriteMode', mode)}
                        className={`py-2 rounded-xl text-[10px] font-bold uppercase border transition-colors ${
                          form.overwriteMode === mode
                            ? 'bg-sky-500 text-black border-sky-400'
                            : 'bg-[#141417] text-gray-400 border-[#222226] hover:text-white'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4 xl:col-span-1">
                <div className="space-y-3">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-[#1c1c20]">
                    <Settings className="w-3.5 h-3.5" />
                    Audio Export Quality
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Sample Rate</span>
                      <select
                        value={form.sampleRate}
                        onChange={(e) => updateField('sampleRate', e.target.value)}
                        className="w-full bg-[#141417] border border-[#222226] rounded-xl px-2.5 py-1.5 text-xs font-mono"
                      >
                        {SAMPLE_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {(parseInt(rate, 10) / 1000).toFixed(1)} kHz
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Bit Depth</span>
                      <select
                        value={form.bitDepth}
                        onChange={(e) => updateField('bitDepth', e.target.value)}
                        className="w-full bg-[#141417] border border-[#222226] rounded-xl px-2.5 py-1.5 text-xs font-mono"
                      >
                        {BIT_DEPTHS.map((depth) => (
                          <option key={depth} value={depth}>
                            {depth}-Bit PCM
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Format</span>
                      <select
                        value={form.format}
                        onChange={(e) => updateField('format', e.target.value as FormState['format'])}
                        className="w-full bg-[#141417] border border-[#222226] rounded-xl px-2.5 py-1.5 text-xs font-mono uppercase"
                      >
                        {FORMATS.map((fmt) => (
                          <option key={fmt} value={fmt}>
                            {fmt.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Peak Ceiling</span>
                      <input
                        type="number"
                        step={0.1}
                        min={-3}
                        max={0}
                        value={form.peakCeilingDb}
                        onChange={(e) => updateField('peakCeilingDb', Number(e.target.value))}
                        className="w-full bg-[#141417] border border-[#222226] rounded-xl px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Channels</span>
                      <div className="flex bg-[#141417] border border-[#222226] rounded-xl p-0.5">
                        <button
                          type="button"
                          onClick={() => updateField('stereoMode', 'mono')}
                          className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase ${
                            form.stereoMode === 'mono' ? 'bg-zinc-800 text-white' : 'text-gray-500'
                          }`}
                        >
                          Mono
                        </button>
                        <button
                          type="button"
                          onClick={() => updateField('stereoMode', 'stereo')}
                          className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase ${
                            form.stereoMode === 'stereo' ? 'bg-zinc-800 text-white' : 'text-gray-500'
                          }`}
                        >
                          Stereo
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Normalization</span>
                      <div className="flex bg-[#141417] border border-[#222226] rounded-xl p-0.5">
                        <button
                          type="button"
                          onClick={() => updateField('normalize', true)}
                          className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase ${
                            form.normalize ? 'bg-zinc-800 text-emerald-400' : 'text-gray-500'
                          }`}
                        >
                          On
                        </button>
                        <button
                          type="button"
                          onClick={() => updateField('normalize', false)}
                          className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase ${
                            !form.normalize ? 'bg-zinc-800 text-white' : 'text-gray-500'
                          }`}
                        >
                          Raw
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Trim Silence</span>
                      <button
                        type="button"
                        onClick={() => updateField('trimSilence', !form.trimSilence)}
                        className={`w-full py-2 rounded-xl border text-[10px] font-bold uppercase ${
                          form.trimSilence
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-[#141417] text-gray-400 border-[#222226]'
                        }`}
                      >
                        {form.trimSilence ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Fade In (ms)</span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={form.fadeInMs}
                        onChange={(e) => updateField('fadeInMs', Math.max(0, Number(e.target.value) || 0))}
                        className="w-full bg-[#141417] border border-[#222226] rounded-xl px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Fade Out (ms)</span>
                      <input
                        type="number"
                        min={0}
                        max={2000}
                        value={form.fadeOutMs}
                        onChange={(e) => updateField('fadeOutMs', Math.max(0, Number(e.target.value) || 0))}
                        className="w-full bg-[#141417] border border-[#222226] rounded-xl px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 xl:col-span-1">
                <div className="space-y-3 pt-1">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-[#1c1c20]">
                    <Shield className="w-3.5 h-3.5" />
                    Metadata & Rights
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Root Pitch Key</span>
                      <select
                        value={form.rootKey}
                        onChange={(e) => updateField('rootKey', e.target.value)}
                        className="w-full bg-[#141417] border border-[#222226] rounded-xl px-2.5 py-1.5 text-xs font-bold"
                      >
                        {KEYS.map((k) => (
                          <option key={k} value={k}>
                            Key: {k}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Tempo (BPM)</span>
                      <input
                        type="number"
                        min={20}
                        max={300}
                        value={form.bpm}
                        onChange={(e) => updateField('bpm', parseInt(e.target.value, 10) || 120)}
                        className="w-full bg-[#141417] border border-[#222226] rounded-xl px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                      {errors.bpm && <p className="text-[10px] text-red-400">{errors.bpm}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">Producer / Creator</span>
                      <input
                        type="text"
                        value={form.creator}
                        onChange={(e) => updateField('creator', e.target.value)}
                        placeholder="Creator Name"
                        className="w-full bg-[#141417] border border-[#222226] rounded-xl px-2.5 py-1.5 text-xs font-bold text-white"
                      />
                      {errors.creator && (
                        <p className="text-[10px] text-red-400">{errors.creator}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[9px] font-mono text-gray-400 uppercase">License Type</span>
                      <select
                        value={form.license}
                        onChange={(e) => updateField('license', e.target.value)}
                        className="w-full bg-[#141417] border border-[#222226] rounded-xl px-2.5 py-1.5 text-xs text-white"
                      >
                        {LICENSES.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Tags
                    </label>
                    <input
                      type="text"
                      value={form.tagsInput}
                      onChange={(e) => updateField('tagsInput', e.target.value)}
                      placeholder="dark, analog, punchy, cinematic"
                      className="w-full bg-[#141417] border border-[#222226] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex flex-wrap gap-1">
                      {['one-shot', form.category.toLowerCase(), form.stereoMode, form.format].map((tag, idx) => (
                        <button
                          key={`${tag}-${idx}`}
                          type="button"
                          onClick={() => addSuggestedTag(tag)}
                          className="px-2 py-1 rounded-full bg-[#18181d] border border-[#292930] text-[10px] text-gray-300 hover:text-white flex items-center gap-1"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          {tag}
                        </button>
                      ))}
                    </div>
                    {parsedTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {parsedTags.map((tag, idx) => (
                          <span
                            key={`${tag}-${idx}`}
                            className="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {errors.tags && <p className="text-[10px] text-red-400">{errors.tags}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Session Notes
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => updateField('notes', e.target.value)}
                      rows={4}
                      placeholder="Optional notes about processing chain, source synth, take number, or intended use..."
                      className="w-full resize-none bg-[#141417] border border-[#222226] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Accent Color
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateField('color', color)}
                          aria-label={`Select accent color ${color}`}
                          className={`w-7 h-7 rounded-full border-2 ${
                            form.color === color ? 'border-white scale-110' : 'border-transparent'
                          } transition-transform`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#1f1f23] bg-[#111115] px-4 py-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    Export Preview
                  </p>
                  <p className="text-xs text-white font-mono break-all">{destinationPreview}</p>
                </div>
                <div className="text-right text-[10px] text-gray-400 space-y-1">
                  <p>
                    {form.sampleRate} Hz • {form.bitDepth}-bit • {form.stereoMode} • {form.format.toUpperCase()}
                  </p>
                  <p>
                    {form.normalize ? `Normalized to ${form.peakCeilingDb} dB` : 'Raw level'} •{' '}
                    {form.trimSilence ? 'Trim silence on' : 'Trim silence off'}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#1f1f23] flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-[#222226] bg-[#141417] hover:bg-[#1a1a20] text-xs font-bold uppercase text-gray-400 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-70 text-black text-xs font-extrabold uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>{isSubmitting ? 'Saving...' : 'Finalize & Save Sample'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};