# Phase 4.5 — AAF export + import (Tauri desktop) — coding plan

> **Status: IMPLEMENTED.** This plan was executed as described. The AAF writer
> lives in `src-tauri/src/aaf/`, produces files that open in pyaaf2 with
> byte-exact PCM round-trip, and is wired into the Produce stage
> (`AafExportPanel.tsx`, desktop-gated). See `plans/workstation-roadmap.md`
> Step 4.5 for the updated summary.

> Goal: emit a **real AAF (Advanced Authoring Format)** file from the desktop
> build so Pro Tools can `File → Import → AAF` and get one audio track per
> stem with the song's beat/bar markers. Also parse our own AAFs back
> (round-trip) as the "AAF import" half of the step.

## Why this shape

- The roadmap's `aaf-rs` crate never shipped; the only Rust AAF crate
  (`oximedia-aaf`) writes a proprietary byte blob, **not** real AAF — Pro
  Tools would reject it.
- We therefore write AAF ourselves on top of the mature **`cfb`** crate
  (mdsteele/rust-cfb, ~50M downloads, read/write, exposes `set_storage_clsid`).
  The plan is a **Rust port of pyaaf2** (markreidvfx/pyaaf2), a pure-Python
  AAF writer proven to produce Pro Tools-compatible files with zero AAF SDK.
- Reference constants (class/property/typedef AUIDs, PIDs, MobID layout,
  `properties` stream format, set/vector index streams) were extracted from
  pyaaf2's source into `plans/phase-4.5-aaf.md` (this file) so the Rust port
  matches byte-for-byte.

## What an AAF file is (exactly what we emit)

An AAF file is an **OLE Compound File Binary (CFB)** whose directory tree is
the AAF object graph. Every AAF object = a CFB **storage** whose CLSID is the
object's class AUID and which contains a `properties` stream (+ optional index
and essence streams).

### On-disk encoding rules (from pyaaf2)
- Everything **little-endian**. Each `properties` stream starts with
  `byte_order = 0x4c` ('L').
- **AUID** (16 bytes): written in *mixed-endian* `bytes_le` (data1/2/3 LE,
  data4 raw). `uuid` crate `to_bytes_le()` matches; the `cfb` crate writes
  CLSID in the identical layout, so `Uuid::parse_str(auid)` is used directly.
- **MobID** (32 bytes): 12-byte SMPTE UMID label + `length(0x13)` +
  `instanceHigh/Mid/Low(0)` + 16-byte material UUID (`bytes_le`). Null MobID =
  32 zero bytes.
- **String**: UTF-16LE + `00 00` terminator.
- **Bool**: 1 byte (0/1). **u8/u16/u32/u64/i64**: little-endian.
- **Rational**: `u32le numerator`, `u32le denominator` (2 × Int32 → 8 bytes).
- **VersionType**: `i8 major`, `i8 minor`. **ProductVersion**: 4 × u16 + u16 type.
- **TimeStamp**: `DateStruct{year i16, month u8, day u8}` +
  `TimeStruct{hour u8, minute u8, second u8, fraction u8}` (8 bytes total).
- **`mangle_name(name, pid, size)`**: `"{name}-{pid:#x}"`, with `name`
  squeezed to `size - len(pid_hex) - 2` chars by replacing the middle with a
  single `-`. Used for child storage names (size 32) and index names (size 22).

### `properties` stream layout
```
u8   byte_order (0x4c)
u8   version (32)
u16  entry_count
[entry_count × { u16 pid, u16 format, u16 byte_size }]
[concatenated property data blobs, in the same order]
```

### Storage-formats (`format` field)
- `0x82` SF_DATA — plain value bytes (string/bool/int/AUID/MobID/Rational/…)
- `0x42` SF_DATA_STREAM — essence stream; data = `0x55` + utf16le(stream name)
- `0x22` SF_STRONG_OBJECT_REFERENCE — data = utf16le(child storage name)
- `0x32` SF_STRONG_OBJECT_REFERENCE_VECTOR — data = utf16le(index name) + a
  `"<index> index"` stream
- `0x3A` SF_STRONG_OBJECT_REFERENCE_SET — data = utf16le(index name) + a
  `"<index> index"` stream
- `0x02` SF_WEAK_OBJECT_REFERENCE — data = `u16 weakref_index` +
  `u16 key_pid` + `u8 key_size` + key bytes (AUID 16 or MobID 32, bytes_le)

### Strong-ref-vector index stream
`u32 count, u32 next_free_key, u32 last_free_key(0xFFFFFFFF), u32[count] local_keys`

### Strong-ref-set index stream
`u32 count, u32 next_free_key, u32 last_free_key(0xFFFFFFFF), u16 key_pid,
u8 key_size`, then `count × { u32 local_key, u32 ref_count(=1), key[key_size] }`

Set children are named `<indexName>{<localKey:#x>}`; vector children likewise.
`next_free_key` = count (keys assigned 0..count-1).

### `/referenced properties` stream (root)
`u8 byte_order(0x4c), u16 path_count, u32 pid_count`, then each path as
`u16` pids terminated by `u16 0`. Paths are the root→property strong-ref pid
chains weakrefs resolve against:
- idx 0 `[0x0001,0x0003]` Root→MetaDictionary→ClassDefinitions
- idx 1 `[0x0001,0x0004]` Root→MetaDictionary→TypeDefinitions
- idx 2 `[0x0002,0x3b04,0x2605]` Root→Header→Dictionary→DataDefinitions
- idx 3 `[0x0001,0x0003,0x0009]` Root→MetaDictionary→ClassDefs[].Properties

## CFB tree for a stem export

```
/  (Root, CLSID=Root b3b398a5-1c90-11d4-8053-080036210804)
  referenced properties                       (stream)
  MetaDictionary-1      (MetaDictionary obj)
    properties            → { ClassDefinitions(0x0003,set), TypeDefinitions(0x0004,set) }
    ClassDefinitions-3 index
    ClassDefinitions-3{0..} (each a ClassDefinition obj)
    TypeDefinitions-4 index
    TypeDefinitions-4{0..}  (each a TypeDefinition obj)
  Header-2             (Header obj)
    properties            → { ByteOrder, LastModified, Content→ContentStorage,
                              Dictionary→Dictionary, Version, IdentificationList,
                              ObjectModelVersion=1, OperationalPattern }
    Content-3b03        (ContentStorage obj)
      properties          → { Mobs(0x1901,set), EssenceData(0x1902,set) }
      Mobs-1901{0}        (CompositionMob)
      Mobs-1901{1..N}     (SourceMob per stem)
      EssenceData-1902{0..N}  (EssenceData per stem, key=MobID)
        Data-2702         (stream: raw PCM samples)
    Dictionary-3b04     (Dictionary obj)
      properties          → { DataDefinitions(0x2605,set) }
      DataDefinitions-2605{0}  (DataDefinition "Sound")
    Identification-3b06{0} (Identification obj)
```

### CompositionMob (the timeline — one TimelineMobSlot per stem)
- `MobID 0x4401`, `Name 0x4402`, `LastModified 0x4404`, `CreationTime 0x4405`,
  `Slots 0x4403` (vector)
- TimelineMobSlot (per stem):
  `SlotID 0x4801`, `SlotName 0x4802` (stem name), `EditRate 0x4b01`
  (Rational = sampleRate/1), `Origin 0x4b02`(0), `Segment 0x4803` → Sequence
- Sequence: `DataDefinition 0x0201`→SOUND, `Length 0x0202`, `Components 0x1001` (vector)
  - SourceClip: `DataDefinition 0x0201`→SOUND, `Length 0x0202`(frames),
    `SourceID 0x1101`(SourceMob MobID), `SourceMobSlotID 0x1102`(1),
    `StartTime 0x1201`(0)

### SourceMob (per stem — embedded WAV/PCM)
- `MobID`, `Name 0x4402` (stem name), `Slots 0x4403`(vector), `LastModified`,
  `CreationTime`, `EssenceDescription 0x4701` → PCMDescriptor
- TimelineMobSlot (slot 1):
  `SlotID 0x4801`(1), `SlotName 0x4802`, `EditRate 0x4b01`(Rational), `Origin 0x4b02`(0),
  `Segment 0x4803` → SourceClip{ DataDefinition→SOUND, Length(frames),
    SourceID=null MobID, SourceMobSlotID=0, StartTime=0 }
- PCMDescriptor (class 0d010101-0101-4800):
  `AudioSamplingRate 0x3d03`(Rational), `Channels 0x3d07`(u32),
  `QuantizationBits 0x3d01`(u32), `SampleRate 0x3001`(Rational),
  `BlockAlign 0x3d0a`(u16), `AverageBPS 0x3d09`(u32), `Length 0x3002`(frames i64)

### EssenceData (per stem)
- `MobID 0x2701` = owning SourceMob's MobID, `Data 0x2702` (SF_DATA_STREAM)
  → raw PCM frames. ContentStorage.EssenceData set keyed by MobID (key_pid
  0x2701, key_size 32).

## Dictionary (MetaDictionary) — the minimal-but-complete set

ClassDefinitions emitted (each with its PropertyDefinitions):
- Meta-classes: ClassDefinition, PropertyDefinition, TypeDefinition(abstract),
  TypeDefinitionInteger, TypeDefinitionStrongObjectReference,
  TypeDefinitionWeakObjectReference, TypeDefinitionEnumeration,
  TypeDefinitionFixedArray, TypeDefinitionVariableArray, TypeDefinitionSet,
  TypeDefinitionString, TypeDefinitionStream, TypeDefinitionRecord,
  TypeDefinitionRename, MetaDictionary, MetaDefinition
- Model classes used: InterchangeObject, Header, Identification, ContentStorage,
  Dictionary, DefinitionObject, DataDefinition, Component, Segment, Sequence,
  SourceReference, SourceClip, Mob, CompositionMob, SourceMob, MobSlot,
  TimelineMobSlot, EssenceData, EssenceDescriptor, FileDescriptor,
  SoundDescriptor, PCMDescriptor, Locator

TypeDefinitions emitted (exact AUIDs from pyaaf2 `model/typedefs.py`):
- ints: aafUInt8/16/32/64, aafInt8/16/32/64
- renames: aafPositionType, aafLengthType (→ aafInt64)
- enums: Boolean, ElectroSpatialFormulation, ProductReleaseType
- records: AUID, MobIDType, Rational, ProductVersion, VersionType, DateStruct,
  TimeStruct, TimeStamp
- fixed arrays: aafUUID, aafUInt8Array8, aafUInt8Array12
- var arrays: aafUUIDArray, aafInt32Array, aafInt64Array, aafStringArray,
  aafUInt32Array, aafDataValue, aafChannelStatusModeArray(only if used)
- strong refs (single): ContentStorage, Dictionary, EssenceDescriptor,
  NetworkLocator?, Segment, SourceClip, SourceReference, ClassDefinition,
  Component, DataDefinition, EssenceData, Identification, Locator, Mob,
  MobSlot, PropertyDefinition, TypeDefinition, FileDescriptor
- strong ref sets: ClassDefinition, DataDefinition, EssenceData,
  Mob, PropertyDefinition, TypeDefinition
- strong ref vectors: Component, Identification, Locator, MobSlot, Segment
- weak refs: ClassDefinitionWeakReference, TypeDefinitionWeakReference,
  DataDefinitionWeakReference, PropertyDefinitionWeakReference
- sets: AUIDSet
- strings: aafString (→ aafCharacter)
- chars: aafCharacter; stream: Stream

> This is the largest block of code (~700–900 lines of Rust data). All values
> come straight from pyaaf2's `model/classdefs.py` + `model/typedefs.py`.

## Module layout (src-tauri/src/aaf/)

- `mod.rs` — module root + re-exports.
- `types.rs` — `Auid`, `MobId`, `Rational`, `DateTime`-like, binary encoders
  (`put_u8/u16/u32/u64/i8/i16/i64`, `put_utf16le`, `put_auid_le`, `put_rational`,
  `put_timestamp`, `put_version_type`, `put_product_version`, `mangle_name`,
  `squeeze_name`). Pure + unit tested.
- `dict.rs` — the dictionary tables (ClassDef/PropertyDef/TypeDef) and the
  constants above. Pure data + builder helpers.
- `writer.rs` — `Object { class_id, props, children }` → walks the graph,
  assigns CFB paths, writes `properties`/`index`/essence streams and the
  `/referenced properties` stream into a `cfb::CompoundFile`. Contains the SF
  codes and index-stream encoders.
- `session.rs` — `export_stems_aaf(stems: Vec<StemData>, song, opts) ->
  Result<Vec<u8>>` builds the full object graph (Header/Dictionary/Content/
  CompositionMob/SourceMobs/EssenceData) and returns the finished AAF bytes.
- `reader.rs` — minimal parser for our subset: opens the CFB, reads Root,
  MetaDictionary (skip), Header, ContentStorage, mobs, slots, source clips,
  descriptors, EssenceData → returns a `ParsedAafSession` for round-trip tests
  and the "import" command.
- `commands.rs` — Tauri commands:
  - `export_aaf_session(payload) -> String (path)` — writes the .aaf next to a
    user-chosen path.
  - `import_aaf_session(path) -> ParsedAafSession` — for the Import UI.

## Implementation order (verify each step)

1. `types.rs` + unit tests — encoders, `mangle_name`, `squeeze_name`, MobID.
   *Verify:* `cargo test` — encoder byte-exactness against known values
   (e.g. `mangle_name("Header",2,32)=="Header-2"`, MobID label bytes).
2. `writer.rs` + unit test — serialize a skeleton file (Root + MetaDictionary
   + Header with 0 mobs) to a Vec, re-open with `cfb` crate, assert storages,
   CLSIDs and the `properties` header bytes.
3. `dict.rs` + unit test — full dictionary, read back class/property/typedef
   counts and spot-check AUIDs.
4. `session.rs` + unit test — one 2-channel stem → bytes; parse with
   `reader.rs`; assert track count, sample rate, channels, frames, PCM round-trip.
5. `commands.rs` + `lib.rs` registration. `cargo build` green.
6. Frontend: desktop-gated "Export AAF" in Produce stage (reuses stem render),
   plus "Import AAF" panel (desktop-gated). Web build shows "desktop only".
7. E2E: if a local `python` exists, run pyaaf2 to open the produced file as a
   structural proof; otherwise rely on our own reader + Pro Tools smoke test
   (documented manual step in README).

## Risks & mitigations

- **Pro Tools dictionary strictness.** We emit a complete dictionary for every
  class we use (matching pyaaf2, which Pro Tools accepts). If Pro Tools
  complains, the fix is to add more standard typedefs — additive, low risk.
- **MobID uniqueness** — use `uuid::Uuid::new_v4` material like pyaaf2.
- **Essence linkage** — EssenceData.MobID must equal SourceMob.MobID; the
  ContentStorage.EssenceData set key_pid is 0x2701 with key_size 32.
- **Big stems** — PCM streams can be large; `cfb` streams handle it, but we
  keep a soft size guard and stream-write (no extra copies beyond the render).
- **Reader scope** — reader only parses what we emit (+ null-MobID source
  clips); external/ref AAFs are out of scope for this step.

## Out of scope (this step)

- Full AAF SDK parity (KLVData, OperationGroups, plugins, descriptive metadata).
- Importing *arbitrary* third-party AAFs (only our own + simple compatible ones).
- Video/picture tracks.
