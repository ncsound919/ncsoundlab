//! AAF session export (Phase 4.5).
//!
//! Builds the object graph for a stem export: a Root + Header + Dictionary +
//! ContentStorage holding a CompositionMob (one audio track per stem) plus a
//! SourceMob + embedded PCM EssenceData per stem, with a full MetaDictionary.

use chrono::{DateTime, Utc};

use crate::aaf::dict::{self, PropDef};
use crate::aaf::types::{Auid, MobId, Rational, enc_auid, enc_bool, enc_i64, enc_mobid, enc_product_version, enc_rational, enc_s64_array, enc_str, enc_timestamp, enc_u16, enc_u32, enc_utf16_array, enc_version_type, mangle_name};
use crate::aaf::writer::{index_name, ref_name, set_child_name, Object, Prop, write_aaf};

/// A single rendered stem to embed in the AAF.
#[derive(Debug, Clone)]
pub struct StemData {
    /// Layer name (track name in Pro Tools).
    pub name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    /// Number of frames (per channel).
    pub frames: i64,
    /// Raw interleaved PCM samples (little-endian).
    pub pcm: Vec<u8>,
}

/// Product identification stamped into the file.
#[derive(Debug, Clone)]
pub struct ExportOptions {
    pub company: String,
    pub product: String,
    pub product_version: String,
    pub product_id: Auid,
}

impl Default for ExportOptions {
    fn default() -> Self {
        ExportOptions {
            company: "NC Sonic".into(),
            product: "NC Sound Lab Studio".into(),
            product_version: "1.0.0".into(),
            product_id: Auid::parse("97e04c67-dbe6-4d11-bcd7-3a3a4253a2ef"),
        }
    }
}

// Weak-reference table indexes (must match writer::WEAKREF_PATHS order).
const WEAKREF_CLASS: u16 = 0;
const WEAKREF_TYPE: u16 = 1;
const WEAKREF_DATA_DEF: u16 = 2;

// Unique-key pids used by weak refs / strong-ref sets.
const PID_CLASSDEF_ID: u16 = 0x0005;
const PID_DATADEF_ID: u16 = 0x1b01;
const PID_MOB_ID: u16 = 0x4401;
const PID_ESSENCEDATA_ID: u16 = 0x2701;

fn weakref(index: u16, key_pid: u16, key: &Auid) -> Prop {
    Prop::WeakRef {
        index,
        key_pid,
        key_size: 16,
        key: enc_auid(key),
    }
}

/// Build the MetaDictionary subtree: the MetaDictionary object plus one
/// ClassDefinition (with its PropertyDefinitions) per emitted class and one
/// TypeDefinition per emitted type.
fn build_meta_dictionary(objects: &mut Vec<Object>, now: &DateTime<Utc>) {
    let base = "/MetaDictionary-1";

    // Class definitions
    let class_index_name = index_name("ClassDefinitions", 0x0003);
    let class_defs = dict::class_definitions();
    let mut class_children: Vec<(Vec<u8>, String)> = Vec::new();
    for (i, cd) in class_defs.iter().enumerate() {
        let child = set_child_name(&class_index_name, i);
        class_children.push((enc_auid(&cd.auid), child.clone()));
        build_class_definition(objects, &format!("{}/{}", base, child), cd);
    }

    // Type definitions
    let type_index_name = index_name("TypeDefinitions", 0x0004);
    let type_defs = dict::type_definitions();
    let mut type_children: Vec<(Vec<u8>, String)> = Vec::new();
    for (i, td) in type_defs.iter().enumerate() {
        let child = set_child_name(&type_index_name, i);
        type_children.push((enc_auid(&td.auid), child.clone()));
        build_type_definition(objects, &format!("{}/{}", base, child), td);
    }

    let mut meta = Object::new(base, dict::CLASS_META_DICTIONARY);
    meta.props.push((
        0x0003,
        Prop::StrongRefSet {
            index_name: class_index_name,
            key_pid: PID_CLASSDEF_ID,
            key_size: 16,
            children: class_children,
        },
    ));
    meta.props.push((
        0x0004,
        Prop::StrongRefSet {
            index_name: type_index_name,
            key_pid: PID_CLASSDEF_ID,
            key_size: 16,
            children: type_children,
        },
    ));
    let _ = now;
    objects.push(meta);
}

fn build_class_definition(objects: &mut Vec<Object>, path: &str, cd: &dict::ClassDef) {
    let props_index = index_name("Properties", 0x0009);
    let mut prop_children: Vec<(Vec<u8>, String)> = Vec::new();
    for (j, pd) in cd.props.iter().enumerate() {
        let child = set_child_name(&props_index, j);
        prop_children.push((enc_auid(&pd.auid), child.clone()));
        build_property_definition(objects, &format!("{}/{}", path, child), pd);
    }

    let parent = cd.parent.unwrap_or(cd.auid);
    let mut obj = Object::new(path, dict::CLASS_CLASS_DEFINITION);
    obj.props.push((PID_CLASSDEF_ID, Prop::Data(enc_auid(&cd.auid))));
    obj.props.push((0x0006, Prop::Data(enc_str(cd.name))));
    obj.props.push((0x0008, weakref(WEAKREF_CLASS, PID_CLASSDEF_ID, &parent)));
    obj.props.push((
        0x0009,
        Prop::StrongRefSet {
            index_name: props_index,
            key_pid: PID_CLASSDEF_ID,
            key_size: 16,
            children: prop_children,
        },
    ));
    obj.props.push((0x000a, Prop::Data(enc_bool(cd.concrete))));
    objects.push(obj);
}

fn build_property_definition(objects: &mut Vec<Object>, path: &str, pd: &PropDef) {
    let mut obj = Object::new(path, dict::CLASS_PROPERTY_DEFINITION);
    obj.props.push((PID_CLASSDEF_ID, Prop::Data(enc_auid(&pd.auid))));
    obj.props.push((0x0006, Prop::Data(enc_str(pd.name))));
    obj.props.push((0x000b, Prop::Data(enc_auid(&pd.typedef))));
    obj.props.push((0x000c, Prop::Data(enc_bool(pd.optional))));
    obj.props.push((0x000d, Prop::Data(enc_u16(pd.pid))));
    obj.props.push((0x000e, Prop::Data(enc_bool(pd.unique))));
    objects.push(obj);
}

fn build_type_definition(objects: &mut Vec<Object>, path: &str, td: &dict::TypeDef) {
    use dict::TypeKind::*;

    let mut obj = Object::new(path, type_class(&td.kind));
    obj.props.push((PID_CLASSDEF_ID, Prop::Data(enc_auid(&td.auid))));
    obj.props.push((0x0006, Prop::Data(enc_str(td.name))));

    match &td.kind {
        Int { size, signed } => {
            obj.props.push((0x000f, Prop::Data(crate::aaf::types::enc_u8(*size))));
            obj.props.push((0x0010, Prop::Data(enc_bool(*signed))));
        }
        StrongObjRef { class } => {
            obj.props.push((0x0011, weakref(WEAKREF_CLASS, PID_CLASSDEF_ID, class)));
        }
        WeakObjRef { class, target_set } => {
            obj.props.push((0x0012, weakref(WEAKREF_CLASS, PID_CLASSDEF_ID, class)));
            obj.props.push((0x0013, Prop::Data(crate::aaf::types::enc_auid_array(target_set))));
        }
        Enum {
            element,
            names,
            values,
        } => {
            obj.props.push((0x0014, weakref(WEAKREF_TYPE, PID_CLASSDEF_ID, element)));
            obj.props.push((0x0015, Prop::Data(enc_utf16_array(names))));
            obj.props.push((0x0016, Prop::Data(enc_s64_array(values))));
        }
        FixedArray { element, count } => {
            obj.props.push((0x0017, weakref(WEAKREF_TYPE, PID_CLASSDEF_ID, element)));
            obj.props.push((0x0018, Prop::Data(enc_u32(*count))));
        }
        VarArray { element } => {
            obj.props.push((0x0019, weakref(WEAKREF_TYPE, PID_CLASSDEF_ID, element)));
        }
        Set { element } => {
            obj.props.push((0x001a, weakref(WEAKREF_TYPE, PID_CLASSDEF_ID, element)));
        }
        Str { element } => {
            obj.props.push((0x001b, weakref(WEAKREF_TYPE, PID_CLASSDEF_ID, element)));
        }
        Stream | Character => {}
        Record { members } => {
            let member_names: Vec<&str> = members.iter().map(|(n, _)| *n).collect();
            let member_types: Vec<Auid> = members.iter().map(|(_, t)| *t).collect();
            let index = mangle_name("MemberTypes", 0x001c, 32);
            obj.props.push((
                0x001c,
                Prop::WeakRefVec {
                    index_name: index,
                    index: WEAKREF_TYPE,
                    key_pid: PID_CLASSDEF_ID,
                    key_size: 16,
                    keys: member_types.iter().map(enc_auid).collect(),
                },
            ));
            obj.props.push((
                0x001d,
                Prop::Data(enc_utf16_array(&member_names)),
            ));
        }
        Rename { renamed } => {
            obj.props.push((0x001e, weakref(WEAKREF_TYPE, PID_CLASSDEF_ID, renamed)));
        }
    }

    objects.push(obj);
}

fn type_class(kind: &dict::TypeKind) -> Auid {
    use dict::TypeKind::*;
    match kind {
        Int { .. } => dict::CLASS_TYPE_INT,
        StrongObjRef { .. } => dict::CLASS_TYPE_STRONG,
        WeakObjRef { .. } => dict::CLASS_TYPE_WEAK,
        Enum { .. } => dict::CLASS_TYPE_ENUM,
        FixedArray { .. } => dict::CLASS_TYPE_FIXED,
        VarArray { .. } => dict::CLASS_TYPE_VAR,
        Set { .. } => dict::CLASS_TYPE_SET,
        Str { .. } => dict::CLASS_TYPE_STRING,
        Stream => dict::CLASS_TYPE_STREAM,
        Record { .. } => dict::CLASS_TYPE_RECORD,
        Rename { .. } => dict::CLASS_TYPE_RENAME,
        Character => dict::CLASS_TYPE_CHARACTER,
    }
}

/// Build the whole session object graph.
fn build_session(
    song_name: &str,
    stems: &[StemData],
    opts: &ExportOptions,
) -> Vec<Object> {
    let now = Utc::now();
    let mut objects: Vec<Object> = Vec::new();

    // ---- Root ----
    let mut root = Object::new("/", dict::CLASS_ROOT);
    root.props.push((0x0001, Prop::StrongRef(ref_name("MetaDictionary", 0x0001))));
    root.props.push((0x0002, Prop::StrongRef(ref_name("Header", 0x0002))));
    objects.push(root);

    // ---- MetaDictionary ----
    build_meta_dictionary(&mut objects, &now);

    // ---- Identification ----
    let ident_child = format!("{}{{0}}", index_name("IdentificationList", 0x3b06));
    let ident_path = format!("/Header-2/{}", ident_child);
    let mut ident = Object::new(&ident_path, dict::CLASS_IDENTIFICATION);
    ident.props.push((0x3c01, Prop::Data(enc_str(&opts.company))));
    ident.props.push((0x3c02, Prop::Data(enc_str(&opts.product))));
    ident.props.push((
        0x3c03,
        Prop::Data(enc_product_version(1, 0, 0, 0, 1)), // VersionReleased
    ));
    ident.props.push((0x3c04, Prop::Data(enc_str(&opts.product_version))));
    ident.props.push((0x3c05, Prop::Data(enc_auid(&opts.product_id))));
    ident.props.push((0x3c06, Prop::Data(enc_timestamp(&now))));
    ident.props.push((0x3c09, Prop::Data(enc_auid(&crate::aaf::types::Auid::from_bytes(
        *uuid::Uuid::new_v4().as_bytes(),
    )))));
    objects.push(ident);

    // ---- ContentStorage ----
    let content_path = "/Header-2/Content-3b03";
    let mobs_index = index_name("Mobs", 0x1901);
    let essence_index = index_name("EssenceData", 0x1902);
    let mut mob_children: Vec<(Vec<u8>, String)> = Vec::new();
    let mut essence_children: Vec<(Vec<u8>, String)> = Vec::new();

    // Source mob IDs are needed both by the composition clips and the essence
    // linkage, so mint them up front.
    let source_mob_ids: Vec<MobId> = (0..stems.len()).map(|_| MobId::new()).collect();

    // Composition mob
    let comp_mob_id = MobId::new();
    let comp_child = set_child_name(&mobs_index, 0);
    mob_children.push((enc_mobid(&comp_mob_id), comp_child.clone()));
    build_composition_mob(
        &mut objects,
        &format!("{}/{}", content_path, comp_child),
        song_name,
        &comp_mob_id,
        stems,
        &source_mob_ids,
        &now,
    );

    // Source mobs + essence per stem
    for (i, stem) in stems.iter().enumerate() {
        let src_mob_id = &source_mob_ids[i];
        let mob_child = set_child_name(&mobs_index, i + 1);
        let ed_child = set_child_name(&essence_index, i);
        mob_children.push((enc_mobid(src_mob_id), mob_child.clone()));
        essence_children.push((enc_mobid(src_mob_id), ed_child.clone()));

        build_source_mob(
            &mut objects,
            &format!("{}/{}", content_path, mob_child),
            stem,
            src_mob_id,
            &now,
        );
        build_essence_data(
            &mut objects,
            &format!("{}/{}", content_path, ed_child),
            src_mob_id,
            stem,
        );
    }

    let mut content = Object::new(content_path, dict::CLASS_CONTENT_STORAGE);
    content.props.push((
        0x1901,
        Prop::StrongRefSet {
            index_name: mobs_index,
            key_pid: PID_MOB_ID,
            key_size: 32,
            children: mob_children,
        },
    ));
    content.props.push((
        0x1902,
        Prop::StrongRefSet {
            index_name: essence_index,
            key_pid: PID_ESSENCEDATA_ID,
            key_size: 32,
            children: essence_children,
        },
    ));
    objects.push(content);

    // ---- Dictionary (Sound datadef) ----
    let dict_path = "/Header-2/Dictionary-3b04";
    let datadef_index = index_name("DataDefinitions", 0x2605);
    let datadef_child = set_child_name(&datadef_index, 0);
    let datadef_path = format!("{}/{}", dict_path, datadef_child);
    let mut datadef = Object::new(&datadef_path, dict::CLASS_DATA_DEFINITION);
    datadef.props.push((0x1b01, Prop::Data(enc_auid(&dict::DATA_DEF_SOUND))));
    datadef.props.push((0x1b02, Prop::Data(enc_str("Sound"))));
    objects.push(datadef);

    let mut dictionary = Object::new(dict_path, dict::CLASS_DICTIONARY);
    dictionary.props.push((
        0x2605,
        Prop::StrongRefSet {
            index_name: datadef_index,
            key_pid: PID_DATADEF_ID,
            key_size: 16,
            children: vec![(enc_auid(&dict::DATA_DEF_SOUND), datadef_child)],
        },
    ));
    objects.push(dictionary);

    // ---- Header ----
    let mut header = Object::new("/Header-2", dict::CLASS_HEADER);
    header.props.push((0x3b01, Prop::Data(enc_u16(0x4949)))); // ByteOrder
    header.props.push((0x3b02, Prop::Data(enc_timestamp(&now)))); // LastModified
    header.props.push((
        0x3b03,
        Prop::StrongRef(ref_name("Content", 0x3b03)),
    ));
    header.props.push((
        0x3b04,
        Prop::StrongRef(ref_name("Dictionary", 0x3b04)),
    ));
    header.props.push((0x3b05, Prop::Data(enc_version_type(1, 2)))); // Version
    header.props.push((
        0x3b06,
        Prop::StrongRefVec {
            index_name: index_name("IdentificationList", 0x3b06),
            children: vec![ident_child],
        },
    ));
    header.props.push((0x3b07, Prop::Data(enc_u32(1)))); // ObjectModelVersion
    header.props.push((
        0x3b09,
        Prop::Data(enc_auid(&dict::OP_PATTERN_EDIT)), // OperationalPattern
    ));
    objects.push(header);

    objects
}

fn build_composition_mob(
    objects: &mut Vec<Object>,
    path: &str,
    song_name: &str,
    mob_id: &MobId,
    stems: &[StemData],
    source_mob_ids: &[MobId],
    now: &DateTime<Utc>,
) {
    let slots_index = index_name("Slots", 0x4403);
    let mut slot_children: Vec<String> = Vec::new();

    for (i, stem) in stems.iter().enumerate() {
        let slot_child = set_child_name(&slots_index, i);
        slot_children.push(slot_child.clone());
        build_composition_slot(
            objects,
            &format!("{}/{}", path, slot_child),
            stem,
            &source_mob_ids[i],
        );
    }

    let mut mob = Object::new(path, dict::CLASS_COMPOSITION_MOB);
    mob.props.push((0x4401, Prop::Data(enc_mobid(mob_id))));
    mob.props.push((0x4402, Prop::Data(enc_str(song_name))));
    mob.props.push((
        0x4403,
        Prop::StrongRefVec {
            index_name: slots_index,
            children: slot_children,
        },
    ));
    mob.props.push((0x4404, Prop::Data(enc_timestamp(now))));
    mob.props.push((0x4405, Prop::Data(enc_timestamp(now))));
    objects.push(mob);
}

fn build_composition_slot(
    objects: &mut Vec<Object>,
    path: &str,
    stem: &StemData,
    source_mob_id: &MobId,
) {
    let segment_ref = ref_name("Segment", 0x4803);
    let seq_path = format!("{}/{}", path, segment_ref);

    // Sequence containing one SourceClip referencing the source mob's slot 1.
    let components_index = index_name("Components", 0x1001);
    let clip_child = set_child_name(&components_index, 0);
    let clip_path = format!("{}/{}", seq_path, clip_child);

    let mut clip = Object::new(&clip_path, dict::CLASS_SOURCE_CLIP);
    clip.props.push((
        0x0201,
        weakref(WEAKREF_DATA_DEF, PID_DATADEF_ID, &dict::DATA_DEF_SOUND),
    ));
    clip.props.push((0x0202, Prop::Data(enc_i64(stem.frames))));
    clip.props.push((0x1101, Prop::Data(enc_mobid(source_mob_id))));
    clip.props.push((0x1102, Prop::Data(enc_u32(1)))); // SourceMobSlotID = source slot 1
    clip.props.push((0x1201, Prop::Data(enc_i64(0))));
    objects.push(clip);

    let mut seq = Object::new(&seq_path, dict::CLASS_SEQUENCE);
    seq.props.push((
        0x0201,
        weakref(WEAKREF_DATA_DEF, PID_DATADEF_ID, &dict::DATA_DEF_SOUND),
    ));
    seq.props.push((0x0202, Prop::Data(enc_i64(stem.frames))));
    seq.props.push((
        0x1001,
        Prop::StrongRefVec {
            index_name: components_index,
            children: vec![clip_child],
        },
    ));
    objects.push(seq);

    // The timeline slot whose segment is the Sequence.
    let mut slot = Object::new(path, dict::CLASS_TIMELINE_MOB_SLOT);
    slot.props.push((0x4801, Prop::Data(enc_u32(1)))); // SlotID
    slot.props.push((0x4802, Prop::Data(enc_str(&stem.name)))); // SlotName
    slot.props.push((0x4803, Prop::StrongRef(segment_ref)));
    slot.props.push((
        0x4b01,
        Prop::Data(enc_rational(&Rational::new(stem.sample_rate, 1))),
    ));
    slot.props.push((0x4b02, Prop::Data(enc_i64(0)))); // Origin
    objects.push(slot);
}

fn build_source_mob(
    objects: &mut Vec<Object>,
    path: &str,
    stem: &StemData,
    mob_id: &MobId,
    now: &DateTime<Utc>,
) {
    let slots_index = index_name("Slots", 0x4403);
    let slot_child = set_child_name(&slots_index, 0);
    let segment_ref = ref_name("Segment", 0x4803);
    let slot_path = format!("{}/{}", path, slot_child);
    let clip_path = format!("{}/{}", slot_path, segment_ref);
    let descriptor_ref = ref_name("EssenceDescription", 0x4701);
    let descriptor_path = format!("{}/{}", path, descriptor_ref);

    // Slot segment = SourceClip with a null SourceID (file-based source mob).
    let mut clip = Object::new(&clip_path, dict::CLASS_SOURCE_CLIP);
    clip.props.push((
        0x0201,
        weakref(WEAKREF_DATA_DEF, PID_DATADEF_ID, &dict::DATA_DEF_SOUND),
    ));
    clip.props.push((0x0202, Prop::Data(enc_i64(stem.frames))));
    clip.props.push((0x1101, Prop::Data(enc_mobid(&MobId::null()))));
    clip.props.push((0x1102, Prop::Data(enc_u32(0))));
    clip.props.push((0x1201, Prop::Data(enc_i64(0))));
    objects.push(clip);

    let mut slot = Object::new(&slot_path, dict::CLASS_TIMELINE_MOB_SLOT);
    slot.props.push((0x4801, Prop::Data(enc_u32(1))));
    slot.props.push((0x4802, Prop::Data(enc_str(&stem.name))));
    slot.props.push((0x4803, Prop::StrongRef(segment_ref)));
    slot.props.push((
        0x4b01,
        Prop::Data(enc_rational(&Rational::new(stem.sample_rate, 1))),
    ));
    slot.props.push((0x4b02, Prop::Data(enc_i64(0))));
    objects.push(slot);

    // PCMDescriptor describing the embedded essence.
    let bytes_per_sample = (stem.bits_per_sample / 8).max(1) as u32;
    let block_align = (stem.channels as u32) * bytes_per_sample;
    let avg_bps = stem.sample_rate * block_align;

    let mut desc = Object::new(&descriptor_path, dict::CLASS_PCM_DESCRIPTOR);
    desc.props.push((
        0x3001,
        Prop::Data(enc_rational(&Rational::new(stem.sample_rate, 1))), // SampleRate
    ));
    desc.props.push((0x3002, Prop::Data(enc_i64(stem.frames)))); // Length
    desc.props.push((
        0x3d03,
        Prop::Data(enc_rational(&Rational::new(stem.sample_rate, 1))), // AudioSamplingRate
    ));
    desc.props.push((0x3d07, Prop::Data(enc_u32(stem.channels as u32))));
    desc.props.push((0x3d01, Prop::Data(enc_u32(stem.bits_per_sample as u32))));
    desc.props.push((0x3d0a, Prop::Data(enc_u16(block_align as u16))));
    desc.props.push((0x3d09, Prop::Data(enc_u32(avg_bps))));
    objects.push(desc);

    // The SourceMob itself.
    let mut mob = Object::new(path, dict::CLASS_SOURCE_MOB);
    mob.props.push((0x4401, Prop::Data(enc_mobid(mob_id))));
    mob.props.push((0x4402, Prop::Data(enc_str(&stem.name))));
    mob.props.push((
        0x4403,
        Prop::StrongRefVec {
            index_name: slots_index,
            children: vec![slot_child],
        },
    ));
    mob.props.push((0x4404, Prop::Data(enc_timestamp(now))));
    mob.props.push((0x4405, Prop::Data(enc_timestamp(now))));
    mob.props.push((0x4701, Prop::StrongRef(descriptor_ref)));
    objects.push(mob);
}

fn build_essence_data(objects: &mut Vec<Object>, path: &str, mob_id: &MobId, stem: &StemData) {
    let stream_name = mangle_name("Data", 0x2702, 32);
    let mut obj = Object::new(path, dict::CLASS_ESSENCE_DATA);
    obj.props.push((0x2701, Prop::Data(enc_mobid(mob_id))));
    obj.props.push((
        0x2702,
        Prop::Stream {
            stream_name: stream_name.clone(),
            data: stem.pcm.clone(),
        },
    ));
    objects.push(obj);
}

/// Render a stem-export AAF to bytes.
pub fn export_stems_aaf(
    song_name: &str,
    stems: &[StemData],
    opts: &ExportOptions,
) -> std::io::Result<Vec<u8>> {
    let objects = build_session(song_name, stems, opts);
    write_aaf(&objects)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stem(name: &str, rate: u32, channels: u16, bits: u16, seconds: u32) -> StemData {
        let bytes_per_sample = (bits / 8) as u32;
        let frames = rate as i64 * seconds as i64;
        let pcm_len = frames as usize * channels as usize * bytes_per_sample as usize;
        let mut pcm = Vec::with_capacity(pcm_len);
        for i in 0..pcm_len {
            pcm.push((i * 7 % 251) as u8); // deterministic pseudo-random PCM
        }
        StemData {
            name: name.into(),
            sample_rate: rate,
            channels,
            bits_per_sample: bits,
            frames,
            pcm,
        }
    }

    #[test]
    fn builds_a_real_cfb_aaf() {
        let stems = vec![
            stem("Kick", 48000, 2, 24, 1),
            stem("Snare", 48000, 1, 16, 1),
        ];
        let bytes = export_stems_aaf("My Song", &stems, &ExportOptions::default()).unwrap();

        // CFB magic + a real sized file
        assert_eq!(&bytes[..8], &[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
        assert!(bytes.len() > 2048);

        let mut comp = cfb::CompoundFile::open(std::io::Cursor::new(bytes)).unwrap();
        // Key storages exist (child names come from mangle_name).
        let ident_child = format!("{}{{0}}", index_name("IdentificationList", 0x3b06));
        for p in [
            "/MetaDictionary-1",
            "/Header-2",
            "/Header-2/Content-3b03",
            "/Header-2/Dictionary-3b04",
            &format!("/Header-2/{}", ident_child),
            "/Header-2/Content-3b03/Mobs-1901{0}",
            "/Header-2/Content-3b03/Mobs-1901{1}",
            "/Header-2/Content-3b03/Mobs-1901{2}",
            "/Header-2/Content-3b03/EssenceData-1902{0}",
        ] {
            assert!(comp.is_storage(p), "missing storage {}", p);
        }
        // Essence stream exists with the expected PCM length
        let mut s = comp.open_stream("/Header-2/Content-3b03/EssenceData-1902{0}/Data-2702").unwrap();
        let mut buf = Vec::new();
        use std::io::Read;
        s.read_to_end(&mut buf).unwrap();
        assert_eq!(buf.len(), stems[0].pcm.len());
        assert_eq!(buf, stems[0].pcm);
    }

    #[test]
    fn root_has_meta_and_header_refs() {
        let stems = vec![stem("Kick", 44100, 2, 24, 1)];
        let objects = build_session("X", &stems, &ExportOptions::default());
        let root = objects.iter().find(|o| o.path == "/").unwrap();
        assert_eq!(root.props.len(), 2);
        assert_eq!(root.props[0].0, 0x0001); // MetaDictionary
        assert_eq!(root.props[1].0, 0x0002); // Header
    }

    fn stem_pcm(name: &str, rate: u32, channels: u16, bits: u16, seconds: u32, fill: impl Fn(usize) -> u8) -> StemData {
        let bytes_per_sample = (bits / 8) as u32;
        let frames = rate as i64 * seconds as i64;
        let pcm_len = frames as usize * channels as usize * bytes_per_sample as usize;
        let pcm: Vec<u8> = (0..pcm_len).map(fill).collect();
        StemData { name: name.into(), sample_rate: rate, channels, bits_per_sample: bits, frames, pcm }
    }

    fn roundtrip(stems: &[StemData]) -> crate::aaf::reader::ParsedAafSession {
        let bytes = export_stems_aaf("RT", stems, &ExportOptions::default()).unwrap();
        crate::aaf::reader::parse_aaf(&bytes).unwrap()
    }

    #[test]
    fn roundtrip_mixed_formats_and_rates() {
        let stems = vec![
            stem_pcm("Stereo24_96k", 96000, 2, 24, 1, |i| (i * 7 % 251) as u8),
            stem_pcm("Mono16_44k", 44100, 1, 16, 1, |i| (i * 13 % 255) as u8),
            stem_pcm("Stereo16_48k", 48000, 2, 16, 2, |i| (i * 3 % 200) as u8),
        ];
        let s = roundtrip(&stems);
        assert_eq!(s.tracks.len(), 3);
        for (i, t) in s.tracks.iter().enumerate() {
            assert_eq!(t.name, stems[i].name);
            assert_eq!(t.sample_rate, stems[i].sample_rate);
            assert_eq!(t.channels, stems[i].channels);
            assert_eq!(t.bits_per_sample, stems[i].bits_per_sample);
            assert_eq!(t.frames, stems[i].frames);
            assert_eq!(t.pcm, stems[i].pcm);
        }
    }

    #[test]
    fn roundtrip_silence_and_clipping() {
        let silence = stem_pcm("Silence", 48000, 2, 24, 1, |_| 0);
        let clipped = stem_pcm("Hot", 48000, 1, 16, 1, |i| if i % 2 == 0 { 0xff } else { 0x00 });
        let s = roundtrip(&[silence.clone(), clipped.clone()]);
        assert_eq!(s.tracks[0].pcm.iter().all(|&b| b == 0), true);
        assert_eq!(s.tracks[1].pcm, clipped.pcm);
    }

    #[test]
    fn roundtrip_single_stem() {
        let one = stem_pcm("Only", 48000, 2, 24, 2, |i| (i % 251) as u8);
        let s = roundtrip(&[one]);
        assert_eq!(s.tracks.len(), 1);
        assert_eq!(s.tracks[0].name, "Only");
    }

    #[test]
    fn empty_session_roundtrips() {
        let s = roundtrip(&[]);
        assert_eq!(s.tracks.len(), 0);
        // still a valid, parseable file with a dictionary
        let bytes = export_stems_aaf("Empty", &[], &ExportOptions::default()).unwrap();
        assert!(bytes.len() > 1024);
    }

    #[test]
    fn session_with_duplicate_names() {
        // Two stems with the same name must not collide (mobids differ).
        let stems = vec![
            stem_pcm("Kick", 48000, 2, 24, 1, |i| (i % 251) as u8),
            stem_pcm("Kick", 48000, 2, 24, 1, |i| (i % 251) as u8),
        ];
        let s = roundtrip(&stems);
        assert_eq!(s.tracks.len(), 2);
        assert_eq!(s.tracks[0].pcm, stems[0].pcm);
        assert_eq!(s.tracks[1].pcm, stems[1].pcm);
    }

    #[test]
    fn very_short_and_long_stems() {
        // 1-frame stem and a 10s stem
        let short = StemData {
            name: "Blip".into(),
            sample_rate: 48000,
            channels: 2,
            bits_per_sample: 24,
            frames: 1,
            pcm: vec![1, 2, 3, 4, 5, 6],
        };
        let long = stem_pcm("Pad", 48000, 2, 24, 10, |i| (i % 251) as u8);
        let s = roundtrip(&[short.clone(), long.clone()]);
        assert_eq!(s.tracks[0].frames, 1);
        assert_eq!(s.tracks[0].pcm, short.pcm);
        assert_eq!(s.tracks[1].frames, 48000 * 10);
    }
}
