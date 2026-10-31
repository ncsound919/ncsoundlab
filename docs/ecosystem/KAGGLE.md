# Finishing the Qwen fine-tunes

**Audited 2026-10-28** against `C:\Users\tap45\Downloads\Pulse Daw`. This is the
state of the four training kernels, the one bug that stopped the last run, and the
shortest path to a usable adapter.

The pattern across all four: **the training loop is not the problem.** Three of
the four got far enough to write a log and a checkpoint. What fails is what
happens *after* the last step — evaluation, saving, or reading the result back.

---

## 1. What exists

| Kernel | Kaggle id | Notebook | Output on disk | Verdict |
|---|---|---|---|---|
| NC Studio mixing | `terrenceperry/qwen-nc-studio-mixing` | `qwen_nc_studio.ipynb` | `qwen_nc_studio/` with `adapter_model.safetensors` (**170 MB**), `checkpoint-6/`, tokenizer | **Crashed at eval** |
| Mix full | (see `kernel-metadata.json`) | `qwen_mix_full.ipynb` | `output_v3/mixparams.parquet`, train log | Artifact is a **parameter table, not weights** |
| Mix test | — | `qwen_mix_test.ipynb` | `output/`, `output2/` | Scratch run |
| Coding mobile | — | `qwen_coding_mobile.ipynb` | notebook only | Never produced an adapter |

**Recipe** (`make_nc_studio_nb.py`): Unsloth `Qwen3.5-4B`, 4-bit, LoRA `r=32`
`alpha=32` `dropout=0.05` across all seven projections, `max_seq_length=1024`,
batch 2 × grad-accum 4 (effective 8), 3 epochs, `lr=2e-4` cosine, `save_steps=100`.

**Datasets** — 16 JSONL files in `data_out/`, ~1.5 MB total of real training text:

| File | Size | File | Size |
|---|--:|---|--:|
| `mix_all_train.jsonl` | 1.29 MB | `mix_real_train.jsonl` | 896 KB |
| `mix_synth_train.jsonl` | 286 KB | `coding_train.jsonl` | 139 KB |
| `mix_all_val.jsonl` | 107 KB | `mix_all_test.jsonl` | 55 KB |
| `nc_studio_mix_train.jsonl` | 52 KB | `engineer_secrets_train.jsonl` | 23 KB |
| `coding_val.jsonl` | 14 KB | `tool_calling_train.jsonl` | 7.5 KB |
| `coding_test.jsonl` | 7.2 KB | `coding_audit_train.jsonl` | 7.0 KB |
| `plugin_dev_train.jsonl` | 6.7 KB | `mastering_secrets_train.jsonl` | 7.0 KB |

---

## 2. The bug that stopped the last run

From `kaggle_qwen_nc_studio/output/qwen-nc-studio-mixing.log`:

```
ValueError: Incorrect image source. Must be a valid URL starting with `http://` or
`https://`, a valid path to an image file, or a base64 encoded string.
Got USER: How do you mix a pop vocal in NC Sound Lab?
...
ASSISTANT: . Failed with Invalid base64-encoded string: number of data characters
(45) cannot be 1 more than a multiple of 4
```

**Diagnosis.** The model was loaded with a *multimodal* processor, so when the
post-training sanity prompt was formatted, the processor read the conversation
turns as if they were image inputs and tried to base64-decode a sentence. The
training itself is text-only; only the harness is wrong. This is the classic
symptom of `FastModel` picking a vision-capable checkpoint for a `Qwen3.5` id.

Two fixes, in order of preference:

1. **Load the text-only class.** Use `FastLanguageModel.from_pretrained(...)` and
   set the processor to the tokenizer. If you keep `FastModel`, assert after load:
   ```python
   assert not getattr(model, "config", None) or not getattr(model.config, "vision_config", None)
   ```
2. **Text-only templating.** If the checkpoint really is multimodal, strip the
   images path: `model.disable_vision()` (Unsloth) or call
   `tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)`
   and feed that string straight to `generate`, bypassing the processor.

Verify with the exact prompt that failed: *"How do you mix a pop vocal in NC Sound
Lab?"* If that returns prose, the crash is gone.

Two more things the log exposes:

- **T4 + bfloat16.** `Unsloth: the model has bfloat16 layers on GPU 0 (Tesla T4),
  which has no native bfloat16, so they run slowly.` You are on a T4. Set
  `dtype = torch.float16` — this is a straight speed win, not a correctness one.
- **`checkpoint-6` contains `optimizer.pt`.** A checkpoint at step 6 means the
  run stopped almost immediately after training began (or `save_steps` in the
  executed notebook was 6, not the 100 in the generator script). Either way, the
  170 MB adapter beside it is **not** a 3-epoch result. Check `global_step` in
  the log before you trust it.

---

## 3. Why `mix_full` has no weights

`output_v3/` contains `mixparams.parquet` (magic `PAR1`, a real Parquet file), a
train log, and `unsloth_compiled_cache/` — but no `adapter_model.safetensors`.
The kernel produced a **parameter table** describing mixes and stopped.

That is useful data, not a model. If `mixparams.parquet` is meant to be the
target for a parameter-prediction task, it belongs in `data_out/` as a dataset,
not in a kernel `output/`. Move it there and treat mix_full as a data-generation
kernel; train from `mix_all_train.jsonl` instead.

---

## 4. The finish sequence

Do one model at a time. Doing four in parallel is why none of them finished.

### Step 0 — get the dashboard back

It was **not running** during this audit (`127.0.0.1:8099` returned nothing,
despite the earlier session reporting PID 17260):

```bash
cd "C:\Users\tap45\Downloads\Overlay Marketing\kaggle-trainer-app\backend"
python -m uvicorn main:app --host 0.0.0.0 --port 8099
```

Phone: `http://192.168.1.240:8099` → Add to Home screen. Confirm
`/api/kernels/all` lists the four kernels before you start anything.

### Step 1 — pick the model that matters

**NC Studio mixing.** It has the most data (1.29 MB), the most specific value
(a mixer copilot that knows your plugin chain), and an adapter already on disk
to compare against.

### Step 2 — fix the harness, not the data

Apply fix 1 above, set `dtype=torch.float16`, and **remove the eval call from the
training kernel**. Training and evaluation in one kernel means a post-training
crash costs you the session. Push the model, then evaluate in a second kernel.

### Step 3 — make the kernel self-contained

`kernel-metadata.json` has `"dataset_sources": []` and `"enable_internet": true`.
The notebook installs packages from the internet and reads data from somewhere
outside Kaggle's dataset mount — which means the run is not reproducible and
cannot be re-run cold.

```jsonc
{
  "dataset_sources": ["terrenceperry/nc-sound-mix-training"],  // upload data_out/ as a Kaggle dataset
  "enable_internet": true                                       // keep only for the pip install
}
```

Then `pd.read_json("/kaggle/input/nc-sound-mix-training/nc_studio_mix_train.jsonl", lines=True)`.
A kernel that reads its data from `/kaggle/input` is a kernel you can re-run in
six months.

### Step 4 — save an artifact you can actually use

`safe_serialization`/`save_pretrained` alone gives you adapter weights and no way
to run them. Add, at the end of the kernel:

```python
model.save_pretrained("/kaggle/working/adapter")
tokenizer.save_pretrained("/kaggle/working/adapter")
# Merge so the phone app can consume a plain model, and keep the adapter small:
model.save_pretrained_merged("/kaggle/working/merged", tokenizer, save_method="merged_16bit")
```

Then download `adapter/` (the small one) to
`Pulse Daw/kaggle_qwen_nc_studio/output/` and record `global_step`, final loss
and `train_runtime` in a `RESULT.md` next to it. **An adapter without its
training metrics is not reproducible.**

Kaggle caps `/kaggle/working` at 20 GB and a GPU session at ~12 h; a 4B 4-bit
LoRA on this data is well inside both, so a timeout means something is looping —
check `logging_steps=10` output before assuming you need a bigger session.

### Step 5 — evaluate once, honestly

Second kernel, load the adapter, and run **the 12 held-out rows** in
`mix_all_test.jsonl`. Score exact-match on the structured fields and spot-check
five free-text answers. Write the numbers into `RESULT.md`.

If exact match is under ~40%, the problem is data format, not epochs — go back to
`data_out/` before you spend another GPU hour.

### Step 6 — only then, the other three

In order: **coding mobile** (139 KB of data, useful for OpenHub), **tool calling**
(7.5 KB — small, so expect it to overfit; use it for few-shot prompting
instead of fine-tuning), **plugin dev**. Skip `mix_full` as a training run.

---

## 5. Reality check on the data size

`mix_all_train.jsonl` is **1.29 MB** — roughly 300–400 conversation examples.
For a 4B model at `r=32`, 3 epochs is a reasonable *first* pass, but expect it to
learn **format and vocabulary**, not judgement. It will sound like an NC Studio
engineer; it will not mix better than you.

That is the right goal for a phone copilot: it should speak your plugin names,
your bus layout and your `.ncbeat` concepts so the app feels native. Judge it on
that, not on whether the mixes are good.

---

## 6. What could not be verified

- **No kernel state was polled live.** The dashboard was down and the Kaggle
  credential lives on your machine, so "running / failed" for each kernel is read
  from the logs on disk, not from the API.
- The 170 MB `adapter_model.safetensors` was not loaded or evaluated.
- `mixparams.parquet` was read only for its magic bytes; its schema is unknown.
- Whether `Qwen3.5-4B` resolves to a vision checkpoint in current Unsloth was not
  tested — the diagnosis comes from the error shape in the log. Apply fix 1 and
  confirm with the failing prompt before changing anything else.
