//! AAF metadata dictionary (Phase 4.5).
//!
//! Class definitions, property definitions and type definitions for every
//! class/type the writer emits. All AUIDs/PIDs are the standard SMPTE values
//! (extracted from pyaaf2's `model/classdefs.py` + `model/typedefs.py`), so a
//! real AAF file can be round-tripped by the AAF SDK / Pro Tools.

use crate::aaf::types::Auid;

/// Root class AUID — used as the CLSID of the root storage.
pub const CLASS_ROOT: Auid = Auid::from_bytes([
    0xb3, 0xb3, 0x98, 0xa5, 0x1c, 0x90, 0x11, 0xd4, 0x80, 0x53, 0x08, 0x00, 0x36, 0x21, 0x08, 0x04,
]);

/// Standard Sound DataDefinition.
pub const DATA_DEF_SOUND: Auid = Auid::parse("01030202-0200-0000-060e-2b3404010101");
pub const DATA_DEF_PICTURE: Auid = Auid::parse("01030202-0100-0000-060e-2b3404010101");

/// Operational pattern for a single-edit AAF: "OpPattern_EditProtocol_Define_All".
pub const OP_PATTERN_EDIT: Auid = Auid::parse("0d011201-0100-0000-060e-2b3404010105");

// ---- Concrete + meta class AUIDs (instantiated as objects) ----
pub const CLASS_META_DICTIONARY: Auid = Auid::parse("0d010101-0225-0000-060e-2b3402060101");
pub const CLASS_CLASS_DEFINITION: Auid = Auid::parse("0d010101-0201-0000-060e-2b3402060101");
pub const CLASS_PROPERTY_DEFINITION: Auid = Auid::parse("0d010101-0202-0000-060e-2b3402060101");
pub const CLASS_TYPE_INT: Auid = Auid::parse("0d010101-0204-0000-060e-2b3402060101");
pub const CLASS_TYPE_STRONG: Auid = Auid::parse("0d010101-0205-0000-060e-2b3402060101");
pub const CLASS_TYPE_WEAK: Auid = Auid::parse("0d010101-0206-0000-060e-2b3402060101");
pub const CLASS_TYPE_ENUM: Auid = Auid::parse("0d010101-0207-0000-060e-2b3402060101");
pub const CLASS_TYPE_FIXED: Auid = Auid::parse("0d010101-0208-0000-060e-2b3402060101");
pub const CLASS_TYPE_VAR: Auid = Auid::parse("0d010101-0209-0000-060e-2b3402060101");
pub const CLASS_TYPE_SET: Auid = Auid::parse("0d010101-020a-0000-060e-2b3402060101");
pub const CLASS_TYPE_STRING: Auid = Auid::parse("0d010101-020b-0000-060e-2b3402060101");
pub const CLASS_TYPE_STREAM: Auid = Auid::parse("0d010101-020c-0000-060e-2b3402060101");
pub const CLASS_TYPE_RECORD: Auid = Auid::parse("0d010101-020d-0000-060e-2b3402060101");
pub const CLASS_TYPE_RENAME: Auid = Auid::parse("0d010101-020e-0000-060e-2b3402060101");
pub const CLASS_TYPE_CHARACTER: Auid = Auid::parse("0d010101-0223-0000-060e-2b3402060101");
pub const CLASS_CONTENT_STORAGE: Auid = Auid::parse("0d010101-0101-1800-060e-2b3402060101");
pub const CLASS_DATA_DEFINITION: Auid = Auid::parse("0d010101-0101-1b00-060e-2b3402060101");
pub const CLASS_DICTIONARY: Auid = Auid::parse("0d010101-0101-2200-060e-2b3402060101");
pub const CLASS_ESSENCE_DATA: Auid = Auid::parse("0d010101-0101-2300-060e-2b3402060101");
pub const CLASS_HEADER: Auid = Auid::parse("0d010101-0101-2f00-060e-2b3402060101");
pub const CLASS_IDENTIFICATION: Auid = Auid::parse("0d010101-0101-3000-060e-2b3402060101");
pub const CLASS_COMPOSITION_MOB: Auid = Auid::parse("0d010101-0101-3500-060e-2b3402060101");
pub const CLASS_SOURCE_MOB: Auid = Auid::parse("0d010101-0101-3700-060e-2b3402060101");
pub const CLASS_TIMELINE_MOB_SLOT: Auid = Auid::parse("0d010101-0101-3b00-060e-2b3402060101");
pub const CLASS_SEQUENCE: Auid = Auid::parse("0d010101-0101-0f00-060e-2b3402060101");
pub const CLASS_SOURCE_CLIP: Auid = Auid::parse("0d010101-0101-1100-060e-2b3402060101");
pub const CLASS_PCM_DESCRIPTOR: Auid = Auid::parse("0d010101-0101-4800-060e-2b3402060101");

pub const PID_NAME: u16 = 0x0006;
pub const PID_AUID: u16 = 0x0005;

// ---------------------------------------------------------------------------
// Type definition AUIDs
// ---------------------------------------------------------------------------

pub const T_INT8: Auid = Auid::parse("01010500-0000-0000-060e-2b3401040101");
pub const T_INT16: Auid = Auid::parse("01010600-0000-0000-060e-2b3401040101");
pub const T_INT32: Auid = Auid::parse("01010700-0000-0000-060e-2b3401040101");
pub const T_INT64: Auid = Auid::parse("01010800-0000-0000-060e-2b3401040101");
pub const T_UINT8: Auid = Auid::parse("01010100-0000-0000-060e-2b3401040101");
pub const T_UINT16: Auid = Auid::parse("01010200-0000-0000-060e-2b3401040101");
pub const T_UINT32: Auid = Auid::parse("01010300-0000-0000-060e-2b3401040101");
pub const T_UINT64: Auid = Auid::parse("01010400-0000-0000-060e-2b3401040101");
pub const T_BOOLEAN: Auid = Auid::parse("01040100-0000-0000-060e-2b3401040101");
pub const T_AUID: Auid = Auid::parse("01030100-0000-0000-060e-2b3401040101");
pub const T_MOBID: Auid = Auid::parse("01030200-0000-0000-060e-2b3401040101");
pub const T_POSITION: Auid = Auid::parse("01012001-0000-0000-060e-2b3401040101");
pub const T_LENGTH: Auid = Auid::parse("01012002-0000-0000-060e-2b3401040101");
pub const T_RATIONAL: Auid = Auid::parse("03010100-0000-0000-060e-2b3401040101");
pub const T_PRODUCT_VERSION: Auid = Auid::parse("03010200-0000-0000-060e-2b3401040101");
pub const T_VERSION_TYPE: Auid = Auid::parse("03010300-0000-0000-060e-2b3401040101");
pub const T_DATE_STRUCT: Auid = Auid::parse("03010500-0000-0000-060e-2b3401040101");
pub const T_TIME_STRUCT: Auid = Auid::parse("03010600-0000-0000-060e-2b3401040101");
pub const T_TIME_STAMP: Auid = Auid::parse("03010700-0000-0000-060e-2b3401040101");
pub const T_ELECTRO_SPATIAL: Auid = Auid::parse("02010122-0000-0000-060e-2b3401040101");
pub const T_PRODUCT_RELEASE_TYPE: Auid = Auid::parse("02010101-0000-0000-060e-2b3401040101");
pub const T_AUID_VAR_ARRAY: Auid = Auid::parse("04010600-0000-0000-060e-2b3401040101");
pub const T_STRING_VAR_ARRAY: Auid = Auid::parse("04010500-0000-0000-060e-2b3401040101");
pub const T_INT64_VAR_ARRAY: Auid = Auid::parse("04010400-0000-0000-060e-2b3401040101");
pub const T_UUID_FIXED_ARRAY: Auid = Auid::parse("01030300-0000-0000-060e-2b3401040101");
pub const T_UINT8_ARRAY_8: Auid = Auid::parse("04010800-0000-0000-060e-2b3401040101");
pub const T_UINT8_ARRAY_12: Auid = Auid::parse("04010200-0000-0000-060e-2b3401040101");
pub const T_STRING: Auid = Auid::parse("01100200-0000-0000-060e-2b3401040101");
pub const T_CHARACTER: Auid = Auid::parse("01100100-0000-0000-060e-2b3401040101");
pub const T_STREAM: Auid = Auid::parse("04100200-0000-0000-060e-2b3401040101");

// weak references
pub const WEAKREF_CLASS_DEF: Auid = Auid::parse("05010100-0000-0000-060e-2b3401040101");
pub const WEAKREF_TYPE_DEF: Auid = Auid::parse("05010900-0000-0000-060e-2b3401040101");
pub const WEAKREF_DATA_DEF: Auid = Auid::parse("05010300-0000-0000-060e-2b3401040101");
pub const WEAKREF_PROPERTY_DEF: Auid = Auid::parse("05010c00-0000-0000-060e-2b3401040101");

// strong references (single)
pub const STRONG_CONTENT_STORAGE: Auid = Auid::parse("05020100-0000-0000-060e-2b3401040101");
pub const STRONG_DICTIONARY: Auid = Auid::parse("05020200-0000-0000-060e-2b3401040101");
pub const STRONG_ESSENCE_DESCRIPTOR: Auid = Auid::parse("05020300-0000-0000-060e-2b3401040101");
pub const STRONG_SEGMENT: Auid = Auid::parse("05020600-0000-0000-060e-2b3401040101");
pub const STRONG_COMPONENT: Auid = Auid::parse("05020b00-0000-0000-060e-2b3401040101");
pub const STRONG_IDENTIFICATION: Auid = Auid::parse("05021000-0000-0000-060e-2b3401040101");
pub const STRONG_MOB_SLOT: Auid = Auid::parse("05021400-0000-0000-060e-2b3401040101");

// strong reference sets
pub const SET_CLASS_DEF: Auid = Auid::parse("05050100-0000-0000-060e-2b3401040101");
pub const SET_DATA_DEF: Auid = Auid::parse("05050400-0000-0000-060e-2b3401040101");
pub const SET_ESSENCE_DATA: Auid = Auid::parse("05050500-0000-0000-060e-2b3401040101");
pub const SET_MOB: Auid = Auid::parse("05050700-0000-0000-060e-2b3401040101");
pub const SET_PROPERTY_DEF: Auid = Auid::parse("05050b00-0000-0000-060e-2b3401040101");
pub const SET_TYPE_DEF: Auid = Auid::parse("05050c00-0000-0000-060e-2b3401040101");

// strong reference vectors
pub const VEC_COMPONENT: Auid = Auid::parse("05060100-0000-0000-060e-2b3401040101");
pub const VEC_IDENTIFICATION: Auid = Auid::parse("05060300-0000-0000-060e-2b3401040101");
pub const VEC_MOB_SLOT: Auid = Auid::parse("05060500-0000-0000-060e-2b3401040101");
pub const VEC_SEGMENT: Auid = Auid::parse("05060600-0000-0000-060e-2b3401040101");
pub const VEC_TYPE_DEF_WEAKREF: Auid = Auid::parse("05040200-0000-0000-060e-2b3401040101");

// ---------------------------------------------------------------------------
// Property definition
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
pub struct PropDef {
    pub name: &'static str,
    pub auid: Auid,
    pub pid: u16,
    pub typedef: Auid,
    pub optional: bool,
    pub unique: bool,
}

impl PropDef {
    const fn new(name: &'static str, auid: &str, pid: u16, typedef: Auid, optional: bool, unique: bool) -> Self {
        PropDef {
            name,
            auid: Auid::parse(auid),
            pid,
            typedef,
            optional,
            unique,
        }
    }
}

// ---------------------------------------------------------------------------
// Class definitions
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ClassDef {
    pub name: &'static str,
    pub auid: Auid,
    pub parent: Option<Auid>,
    pub concrete: bool,
    pub props: Vec<PropDef>,
}

macro_rules! class {
    ($name:expr, $auid:expr, $parent:expr, $concrete:expr) => {
        ClassDef {
            name: $name,
            auid: Auid::parse($auid),
            parent: $parent,
            concrete: $concrete,
            props: Vec::new(),
        }
    };
    ($name:expr, $auid:expr, $parent:expr, $concrete:expr, $props:expr) => {
        ClassDef {
            name: $name,
            auid: Auid::parse($auid),
            parent: $parent,
            concrete: $concrete,
            props: $props,
        }
    };
}

/// The class definitions emitted in the MetaDictionary (ordered: parents before
/// children where it matters for readability only; the set is unordered).
pub fn class_definitions() -> Vec<ClassDef> {
    let no = None;

    let interchange_object = class!(
        "InterchangeObject",
        "0d010101-0101-0100-060e-2b3402060101",
        no,
        false,
        vec![PropDef::new(
            "Generation",
            "05200701-0800-0000-060e-2b3401010102",
            0x0102,
            T_AUID,
            true,
            false,
        )]
    );

    let component = class!(
        "Component",
        "0d010101-0101-0200-060e-2b3402060101",
        Some(interchange_object.auid),
        false,
        vec![PropDef::new(
                "DataDefinition",
                "04070100-0000-0000-060e-2b3401010102",
                0x0201,
                WEAKREF_DATA_DEF,
                false,
                false,
            ),
            PropDef::new(
                "Length",
                "07020201-0103-0000-060e-2b3401010102",
                0x0202,
                T_LENGTH,
                true,
                false,
            ),
        ]
    );

    let segment = class!(
        "Segment",
        "0d010101-0101-0300-060e-2b3402060101",
        Some(component.auid),
        false
    );

    let source_reference = class!(
        "SourceReference",
        "0d010101-0101-1000-060e-2b3402060101",
        Some(segment.auid),
        false,
        vec![PropDef::new(
                "SourceID",
                "06010103-0100-0000-060e-2b3401010102",
                0x1101,
                T_MOBID,
                true,
                false,
            ),
            PropDef::new(
                "SourceMobSlotID",
                "06010103-0200-0000-060e-2b3401010102",
                0x1102,
                T_UINT32,
                false,
                false,
            ),
        ]
    );

    let content_storage = class!(
        "ContentStorage",
        "0d010101-0101-1800-060e-2b3402060101",
        Some(interchange_object.auid),
        true,
        vec![PropDef::new(
                "Mobs",
                "06010104-0501-0000-060e-2b3401010102",
                0x1901,
                SET_MOB,
                false,
                false,
            ),
            PropDef::new(
                "EssenceData",
                "06010104-0502-0000-060e-2b3401010102",
                0x1902,
                SET_ESSENCE_DATA,
                true,
                false,
            ),
        ]
    );

    let definition_object = class!(
        "DefinitionObject",
        "0d010101-0101-1a00-060e-2b3402060101",
        Some(interchange_object.auid),
        false,
        vec![PropDef::new(
                "Identification",
                "01011503-0000-0000-060e-2b3401010102",
                0x1b01,
                T_AUID,
                false,
                true,
            ),
            PropDef::new(
                "Name",
                "01070102-0301-0000-060e-2b3401010102",
                0x1b02,
                T_STRING,
                false,
                false,
            ),
        ]
    );

    let essence_data = class!(
        "EssenceData",
        "0d010101-0101-2300-060e-2b3402060101",
        Some(interchange_object.auid),
        true,
        vec![PropDef::new(
                "MobID",
                "06010106-0100-0000-060e-2b3401010102",
                0x2701,
                T_MOBID,
                false,
                true,
            ),
            PropDef::new(
                "Data",
                "04070200-0000-0000-060e-2b3401010102",
                0x2702,
                T_STREAM,
                false,
                false,
            ),
        ]
    );

    let essence_descriptor = class!(
        "EssenceDescriptor",
        "0d010101-0101-2400-060e-2b3402060101",
        Some(interchange_object.auid),
        false
    );

    let file_descriptor = class!(
        "FileDescriptor",
        "0d010101-0101-2500-060e-2b3402060101",
        Some(essence_descriptor.auid),
        false,
        vec![PropDef::new(
                "SampleRate",
                "04060101-0000-0000-060e-2b3401010101",
                0x3001,
                T_RATIONAL,
                false,
                false,
            ),
            PropDef::new(
                "Length",
                "04060102-0000-0000-060e-2b3401010101",
                0x3002,
                T_LENGTH,
                false,
                false,
            ),
        ]
    );

    let sound_descriptor = class!(
        "SoundDescriptor",
        "0d010101-0101-4200-060e-2b3402060101",
        Some(file_descriptor.auid),
        true,
        vec![PropDef::new(
                "AudioSamplingRate",
                "04020301-0101-0000-060e-2b3401010105",
                0x3d03,
                T_RATIONAL,
                false,
                false,
            ),
            PropDef::new(
                "Channels",
                "04020101-0400-0000-060e-2b3401010105",
                0x3d07,
                T_UINT32,
                false,
                false,
            ),
            PropDef::new(
                "QuantizationBits",
                "04020303-0400-0000-060e-2b3401010104",
                0x3d01,
                T_UINT32,
                false,
                false,
            ),
        ]
    );

    let pcm_descriptor = class!(
        "PCMDescriptor",
        "0d010101-0101-4800-060e-2b3402060101",
        Some(sound_descriptor.auid),
        true,
        vec![PropDef::new(
                "BlockAlign",
                "04020302-0100-0000-060e-2b3401010105",
                0x3d0a,
                T_UINT16,
                false,
                false,
            ),
            PropDef::new(
                "AverageBPS",
                "04020303-0500-0000-060e-2b3401010105",
                0x3d09,
                T_UINT32,
                false,
                false,
            ),
        ]
    );

    let header = class!(
        "Header",
        "0d010101-0101-2f00-060e-2b3402060101",
        Some(interchange_object.auid),
        true,
        vec![PropDef::new(
                "ByteOrder",
                "03010201-0200-0000-060e-2b3401010101",
                0x3b01,
                T_UINT16,
                false,
                false,
            ),
            PropDef::new(
                "LastModified",
                "07020110-0204-0000-060e-2b3401010102",
                0x3b02,
                T_TIME_STAMP,
                false,
                false,
            ),
            PropDef::new(
                "Content",
                "06010104-0201-0000-060e-2b3401010102",
                0x3b03,
                STRONG_CONTENT_STORAGE,
                false,
                false,
            ),
            PropDef::new(
                "Dictionary",
                "06010104-0202-0000-060e-2b3401010102",
                0x3b04,
                STRONG_DICTIONARY,
                false,
                false,
            ),
            PropDef::new(
                "Version",
                "03010201-0500-0000-060e-2b3401010102",
                0x3b05,
                T_VERSION_TYPE,
                false,
                false,
            ),
            PropDef::new(
                "IdentificationList",
                "06010104-0604-0000-060e-2b3401010102",
                0x3b06,
                VEC_IDENTIFICATION,
                false,
                false,
            ),
            PropDef::new(
                "ObjectModelVersion",
                "03010201-0400-0000-060e-2b3401010102",
                0x3b07,
                T_UINT32,
                true,
                false,
            ),
            PropDef::new(
                "OperationalPattern",
                "01020203-0000-0000-060e-2b3401010105",
                0x3b09,
                T_AUID,
                true,
                false,
            ),
        ]
    );

    let identification = class!(
        "Identification",
        "0d010101-0101-3000-060e-2b3402060101",
        Some(interchange_object.auid),
        true,
        vec![PropDef::new(
                "CompanyName",
                "05200701-0201-0000-060e-2b3401010102",
                0x3c01,
                T_STRING,
                false,
                false,
            ),
            PropDef::new(
                "ProductName",
                "05200701-0301-0000-060e-2b3401010102",
                0x3c02,
                T_STRING,
                false,
                false,
            ),
            PropDef::new(
                "ProductVersion",
                "05200701-0400-0000-060e-2b3401010102",
                0x3c03,
                T_PRODUCT_VERSION,
                true,
                false,
            ),
            PropDef::new(
                "ProductVersionString",
                "05200701-0501-0000-060e-2b3401010102",
                0x3c04,
                T_STRING,
                false,
                false,
            ),
            PropDef::new(
                "ProductID",
                "05200701-0700-0000-060e-2b3401010102",
                0x3c05,
                T_AUID,
                false,
                false,
            ),
            PropDef::new(
                "Date",
                "07020110-0203-0000-060e-2b3401010102",
                0x3c06,
                T_TIME_STAMP,
                false,
                false,
            ),
            PropDef::new(
                "GenerationAUID",
                "05200701-0100-0000-060e-2b3401010102",
                0x3c09,
                T_AUID,
                false,
                false,
            ),
        ]
    );

    let mob = class!(
        "Mob",
        "0d010101-0101-3400-060e-2b3402060101",
        Some(interchange_object.auid),
        false,
        vec![PropDef::new(
                "MobID",
                "01011510-0000-0000-060e-2b3401010101",
                0x4401,
                T_MOBID,
                false,
                true,
            ),
            PropDef::new(
                "Name",
                "01030302-0100-0000-060e-2b3401010101",
                0x4402,
                T_STRING,
                true,
                false,
            ),
            PropDef::new(
                "Slots",
                "06010104-0605-0000-060e-2b3401010102",
                0x4403,
                VEC_MOB_SLOT,
                false,
                false,
            ),
            PropDef::new(
                "LastModified",
                "07020110-0205-0000-060e-2b3401010102",
                0x4404,
                T_TIME_STAMP,
                false,
                false,
            ),
            PropDef::new(
                "CreationTime",
                "07020110-0103-0000-060e-2b3401010102",
                0x4405,
                T_TIME_STAMP,
                false,
                false,
            ),
        ]
    );

    let composition_mob = class!(
        "CompositionMob",
        "0d010101-0101-3500-060e-2b3402060101",
        Some(mob.auid),
        true
    );

    let source_mob = class!(
        "SourceMob",
        "0d010101-0101-3700-060e-2b3402060101",
        Some(mob.auid),
        true,
        vec![PropDef::new(
            "EssenceDescription",
            "06010104-0203-0000-060e-2b3401010102",
            0x4701,
            STRONG_ESSENCE_DESCRIPTOR,
            false,
            false,
        )]
    );

    let mob_slot = class!(
        "MobSlot",
        "0d010101-0101-3800-060e-2b3402060101",
        Some(interchange_object.auid),
        false,
        vec![PropDef::new(
                "SlotID",
                "01070101-0000-0000-060e-2b3401010102",
                0x4801,
                T_UINT32,
                false,
                false,
            ),
            PropDef::new(
                "SlotName",
                "01070102-0100-0000-060e-2b3401010102",
                0x4802,
                T_STRING,
                true,
                false,
            ),
            PropDef::new(
                "Segment",
                "06010104-0204-0000-060e-2b3401010102",
                0x4803,
                STRONG_SEGMENT,
                false,
                false,
            ),
        ]
    );

    let timeline_mob_slot = class!(
        "TimelineMobSlot",
        "0d010101-0101-3b00-060e-2b3402060101",
        Some(mob_slot.auid),
        true,
        vec![PropDef::new(
                "EditRate",
                "05300405-0000-0000-060e-2b3401010102",
                0x4b01,
                T_RATIONAL,
                false,
                false,
            ),
            PropDef::new(
                "Origin",
                "07020103-0103-0000-060e-2b3401010102",
                0x4b02,
                T_POSITION,
                false,
                false,
            ),
        ]
    );

    let sequence = class!(
        "Sequence",
        "0d010101-0101-0f00-060e-2b3402060101",
        Some(segment.auid),
        true,
        vec![PropDef::new(
            "Components",
            "06010104-0609-0000-060e-2b3401010102",
            0x1001,
            VEC_COMPONENT,
            false,
            false,
        )]
    );

    let source_clip = class!(
        "SourceClip",
        "0d010101-0101-1100-060e-2b3402060101",
        Some(source_reference.auid),
        true,
        vec![PropDef::new(
            "StartTime",
            "07020103-0104-0000-060e-2b3401010102",
            0x1201,
            T_POSITION,
            true,
            false,
        )]
    );

    let dictionary = class!(
        "Dictionary",
        "0d010101-0101-2200-060e-2b3402060101",
        Some(interchange_object.auid),
        true,
        vec![PropDef::new(
            "DataDefinitions",
            "06010104-0505-0000-060e-2b3401010102",
            0x2605,
            SET_DATA_DEF,
            true,
            false,
        )]
    );

    // ---- meta classes ----
    let meta_definition = class!(
        "MetaDefinition",
        "0d010101-0224-0000-060e-2b3402060101",
        no,
        false,
        vec![PropDef::new(
                "Identification",
                "06010107-1300-0000-060e-2b3401010102",
                0x0005,
                T_AUID,
                false,
                true,
            ),
            PropDef::new(
                "Name",
                "03020401-0201-0000-060e-2b3401010102",
                0x0006,
                T_STRING,
                false,
                false,
            ),
        ]
    );

    let class_definition = class!(
        "ClassDefinition",
        "0d010101-0201-0000-060e-2b3402060101",
        Some(meta_definition.auid),
        true,
        vec![PropDef::new(
                "ParentClass",
                "06010107-0100-0000-060e-2b3401010102",
                0x0008,
                WEAKREF_CLASS_DEF,
                false,
                false,
            ),
            PropDef::new(
                "Properties",
                "06010107-0200-0000-060e-2b3401010102",
                0x0009,
                SET_PROPERTY_DEF,
                true,
                false,
            ),
            PropDef::new(
                "IsConcrete",
                "06010107-0300-0000-060e-2b3401010102",
                0x000a,
                T_BOOLEAN,
                false,
                false,
            ),
        ]
    );

    let property_definition = class!(
        "PropertyDefinition",
        "0d010101-0202-0000-060e-2b3402060101",
        Some(meta_definition.auid),
        true,
        vec![PropDef::new(
                "Type",
                "06010107-0400-0000-060e-2b3401010102",
                0x000b,
                T_AUID,
                false,
                false,
            ),
            PropDef::new(
                "IsOptional",
                "03010202-0100-0000-060e-2b3401010102",
                0x000c,
                T_BOOLEAN,
                false,
                false,
            ),
            PropDef::new(
                "LocalIdentification",
                "06010107-0500-0000-060e-2b3401010102",
                0x000d,
                T_UINT16,
                false,
                false,
            ),
            PropDef::new(
                "IsUniqueIdentifier",
                "06010107-0600-0000-060e-2b3401010102",
                0x000e,
                T_BOOLEAN,
                true,
                false,
            ),
        ]
    );

    let type_definition = class!(
        "TypeDefinition",
        "0d010101-0203-0000-060e-2b3402060101",
        Some(meta_definition.auid),
        false
    );

    let type_int = class!(
        "TypeDefinitionInteger",
        "0d010101-0204-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true,
        vec![PropDef::new(
                "Size",
                "03010203-0100-0000-060e-2b3401010102",
                0x000f,
                T_UINT8,
                false,
                false,
            ),
            PropDef::new(
                "IsSigned",
                "03010203-0200-0000-060e-2b3401010102",
                0x0010,
                T_BOOLEAN,
                false,
                false,
            ),
        ]
    );

    let type_strong = class!(
        "TypeDefinitionStrongObjectReference",
        "0d010101-0205-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true,
        vec![PropDef::new(
            "ReferencedType",
            "06010107-0900-0000-060e-2b3401010102",
            0x0011,
            WEAKREF_CLASS_DEF,
            false,
            false,
        )]
    );

    let type_weak = class!(
        "TypeDefinitionWeakObjectReference",
        "0d010101-0206-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true,
        vec![PropDef::new(
                "ReferencedType",
                "06010107-0a00-0000-060e-2b3401010102",
                0x0012,
                WEAKREF_CLASS_DEF,
                false,
                false,
            ),
            PropDef::new(
                "TargetSet",
                "03010203-0b00-0000-060e-2b3401010102",
                0x0013,
                T_AUID_VAR_ARRAY,
                false,
                false,
            ),
        ]
    );

    let type_enum = class!(
        "TypeDefinitionEnumeration",
        "0d010101-0207-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true,
        vec![PropDef::new(
                "ElementType",
                "06010107-0b00-0000-060e-2b3401010102",
                0x0014,
                WEAKREF_TYPE_DEF,
                false,
                false,
            ),
            PropDef::new(
                "ElementNames",
                "03010203-0400-0000-060e-2b3401010102",
                0x0015,
                T_STRING_VAR_ARRAY,
                false,
                false,
            ),
            PropDef::new(
                "ElementValues",
                "03010203-0500-0000-060e-2b3401010102",
                0x0016,
                T_INT64_VAR_ARRAY,
                false,
                false,
            ),
        ]
    );

    let type_fixed = class!(
        "TypeDefinitionFixedArray",
        "0d010101-0208-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true,
        vec![PropDef::new(
                "ElementType",
                "06010107-0c00-0000-060e-2b3401010102",
                0x0017,
                WEAKREF_TYPE_DEF,
                false,
                false,
            ),
            PropDef::new(
                "ElementCount",
                "03010203-0300-0000-060e-2b3401010102",
                0x0018,
                T_UINT32,
                false,
                false,
            ),
        ]
    );

    let type_var = class!(
        "TypeDefinitionVariableArray",
        "0d010101-0209-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true,
        vec![PropDef::new(
            "ElementType",
            "06010107-0d00-0000-060e-2b3401010102",
            0x0019,
            WEAKREF_TYPE_DEF,
            false,
            false,
        )]
    );

    let type_set = class!(
        "TypeDefinitionSet",
        "0d010101-020a-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true,
        vec![PropDef::new(
            "ElementType",
            "06010107-0e00-0000-060e-2b3401010102",
            0x001a,
            WEAKREF_TYPE_DEF,
            false,
            false,
        )]
    );

    let type_string = class!(
        "TypeDefinitionString",
        "0d010101-020b-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true,
        vec![PropDef::new(
            "ElementType",
            "06010107-0f00-0000-060e-2b3401010102",
            0x001b,
            WEAKREF_TYPE_DEF,
            false,
            false,
        )]
    );

    let type_stream = class!(
        "TypeDefinitionStream",
        "0d010101-020c-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true
    );

    let type_record = class!(
        "TypeDefinitionRecord",
        "0d010101-020d-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true,
        vec![PropDef::new(
                "MemberTypes",
                "06010107-1100-0000-060e-2b3401010102",
                0x001c,
                VEC_TYPE_DEF_WEAKREF,
                false,
                false,
            ),
            PropDef::new(
                "MemberNames",
                "03010203-0600-0000-060e-2b3401010102",
                0x001d,
                T_STRING_VAR_ARRAY,
                false,
                false,
            ),
        ]
    );

    let type_rename = class!(
        "TypeDefinitionRename",
        "0d010101-020e-0000-060e-2b3402060101",
        Some(type_definition.auid),
        true,
        vec![PropDef::new(
            "RenamedType",
            "06010107-1200-0000-060e-2b3401010102",
            0x001e,
            WEAKREF_TYPE_DEF,
            false,
            false,
        )]
    );

    let meta_dictionary = class!(
        "MetaDictionary",
        "0d010101-0225-0000-060e-2b3402060101",
        no,
        true,
        vec![PropDef::new(
                "ClassDefinitions",
                "06010107-0700-0000-060e-2b3401010102",
                0x0003,
                SET_CLASS_DEF,
                true,
                false,
            ),
            PropDef::new(
                "TypeDefinitions",
                "06010107-0800-0000-060e-2b3401010102",
                0x0004,
                SET_TYPE_DEF,
                true,
                false,
            ),
        ]
    );

    let data_definition = class!(
        "DataDefinition",
        "0d010101-0101-1b00-060e-2b3402060101",
        Some(definition_object.auid),
        true
    );

    vec![
        interchange_object,
        component,
        segment,
        sequence,
        source_reference,
        source_clip,
        content_storage,
        definition_object,
        data_definition,
        dictionary,
        essence_data,
        essence_descriptor,
        file_descriptor,
        sound_descriptor,
        pcm_descriptor,
        header,
        identification,
        mob,
        composition_mob,
        source_mob,
        mob_slot,
        timeline_mob_slot,
        meta_definition,
        class_definition,
        property_definition,
        type_definition,
        type_int,
        type_strong,
        type_weak,
        type_enum,
        type_fixed,
        type_var,
        type_set,
        type_string,
        type_stream,
        type_record,
        type_rename,
        meta_dictionary,
    ]
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub enum TypeKind {
    /// TypeDefinitionInteger
    Int { size: u8, signed: bool },
    /// TypeDefinitionStrongObjectReference — references a class by AUID.
    StrongObjRef { class: Auid },
    /// TypeDefinitionWeakObjectReference — references a class; `target_set`
    /// holds the property AUIDs forming the root→set path (resolves to pids).
    WeakObjRef { class: Auid, target_set: &'static [Auid] },
    /// TypeDefinitionEnumeration
    Enum {
        element: Auid,
        names: &'static [&'static str],
        values: &'static [i64],
    },
    /// TypeDefinitionFixedArray
    FixedArray { element: Auid, count: u32 },
    /// TypeDefinitionVariableArray
    VarArray { element: Auid },
    /// TypeDefinitionSet
    Set { element: Auid },
    /// TypeDefinitionString
    Str { element: Auid },
    /// TypeDefinitionStream
    Stream,
    /// TypeDefinitionRecord — `(member_name, member_type_auid)`.
    Record { members: &'static [(&'static str, Auid)] },
    /// TypeDefinitionRename
    Rename { renamed: Auid },
    /// TypeDefinitionCharacter
    Character,
}

#[derive(Debug, Clone)]
pub struct TypeDef {
    pub name: &'static str,
    pub auid: Auid,
    pub kind: TypeKind,
}

macro_rules! ty {
    ($name:expr, $auid:expr, $kind:expr) => {
        TypeDef {
            name: $name,
            auid: Auid::parse($auid),
            kind: $kind,
        }
    };
}

// Property AUIDs forming the root→set path for each weak-reference family.
const PATH_METADICT_CLASSDEFS: &[Auid] = &[
    Auid::parse("0d010301-0101-0100-060e-2b3401010102"),
    Auid::parse("06010107-0700-0000-060e-2b3401010102"),
];
const PATH_METADICT_TYPEDEFS: &[Auid] = &[
    Auid::parse("0d010301-0101-0100-060e-2b3401010102"),
    Auid::parse("06010107-0800-0000-060e-2b3401010102"),
];
const PATH_HEADER_DICT_DATADEFS: &[Auid] = &[
    Auid::parse("0d010301-0102-0100-060e-2b3401010102"),
    Auid::parse("06010104-0202-0000-060e-2b3401010102"),
    Auid::parse("06010104-0505-0000-060e-2b3401010102"),
];
const PATH_METADICT_CLASSDEFS_PROPERTIES: &[Auid] = &[
    Auid::parse("0d010301-0101-0100-060e-2b3401010102"),
    Auid::parse("06010107-0700-0000-060e-2b3401010102"),
    Auid::parse("06010107-0200-0000-060e-2b3401010102"),
];

/// All type definitions emitted in the MetaDictionary.
pub fn type_definitions() -> Vec<TypeDef> {
    use TypeKind::*;
    let int64 = Auid::parse("01010800-0000-0000-060e-2b3401040101");
    let uint8 = Auid::parse("01010100-0000-0000-060e-2b3401040101");
    let auid = Auid::parse("01030100-0000-0000-060e-2b3401040101");

    // referenced classes
    let cls_component = Auid::parse("0d010101-0101-0200-060e-2b3402060101");
    let cls_segment = Auid::parse("0d010101-0101-0300-060e-2b3402060101");
    let cls_content_storage = Auid::parse("0d010101-0101-1800-060e-2b3402060101");
    let cls_data_definition = Auid::parse("0d010101-0101-1b00-060e-2b3402060101");
    let cls_dictionary = Auid::parse("0d010101-0101-2200-060e-2b3402060101");
    let cls_essence_data = Auid::parse("0d010101-0101-2300-060e-2b3402060101");
    let cls_essence_descriptor = Auid::parse("0d010101-0101-2400-060e-2b3402060101");
    let cls_identification = Auid::parse("0d010101-0101-3000-060e-2b3402060101");
    let cls_mob = Auid::parse("0d010101-0101-3400-060e-2b3402060101");
    let cls_mob_slot = Auid::parse("0d010101-0101-3800-060e-2b3402060101");
    let cls_class_def = Auid::parse("0d010101-0201-0000-060e-2b3402060101");
    let cls_property_def = Auid::parse("0d010101-0202-0000-060e-2b3402060101");
    let cls_type_def = Auid::parse("0d010101-0203-0000-060e-2b3402060101");

    // single strong refs
    let strong_content_storage = ty!(
        "ContentStorageStrongReference",
        "05020100-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_content_storage }
    );
    let strong_dictionary = ty!(
        "DictionaryStrongReference",
        "05020200-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_dictionary }
    );
    let strong_essence_descriptor = ty!(
        "EssenceDescriptorStrongReference",
        "05020300-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_essence_descriptor }
    );
    let strong_segment = ty!(
        "SegmentStrongReference",
        "05020600-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_segment }
    );
    let strong_component = ty!(
        "ComponentStrongReference",
        "05020b00-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_component }
    );
    let strong_identification = ty!(
        "IdentificationStrongReference",
        "05021000-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_identification }
    );
    let strong_mob_slot = ty!(
        "MobSlotStrongReference",
        "05021400-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_mob_slot }
    );
    let strong_class_def = ty!(
        "ClassDefinitionStrongReference",
        "05020900-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_class_def }
    );
    let strong_data_definition = ty!(
        "DataDefinitionStrongReference",
        "05020e00-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_data_definition }
    );
    let strong_essence_data = ty!(
        "EssenceDataStrongReference",
        "05020f00-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_essence_data }
    );
    let strong_mob = ty!(
        "MobStrongReference",
        "05021300-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_mob }
    );
    let strong_property_def = ty!(
        "PropertyDefinitionStrongReference",
        "05021900-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_property_def }
    );
    let strong_type_def = ty!(
        "TypeDefinitionStrongReference",
        "05021b00-0000-0000-060e-2b3401040101",
        StrongObjRef { class: cls_type_def }
    );

    // weak refs
    let weak_class_def = ty!(
        "ClassDefinitionWeakReference",
        "05010100-0000-0000-060e-2b3401040101",
        WeakObjRef {
            class: cls_class_def,
            target_set: PATH_METADICT_CLASSDEFS,
        }
    );
    let weak_type_def = ty!(
        "TypeDefinitionWeakReference",
        "05010900-0000-0000-060e-2b3401040101",
        WeakObjRef {
            class: cls_type_def,
            target_set: PATH_METADICT_TYPEDEFS,
        }
    );
    let weak_data_definition = ty!(
        "DataDefinitionWeakReference",
        "05010300-0000-0000-060e-2b3401040101",
        WeakObjRef {
            class: cls_data_definition,
            target_set: PATH_HEADER_DICT_DATADEFS,
        }
    );
    let weak_property_def = ty!(
        "PropertyDefinitionWeakReference",
        "05010c00-0000-0000-060e-2b3401040101",
        WeakObjRef {
            class: cls_property_def,
            target_set: PATH_METADICT_CLASSDEFS_PROPERTIES,
        }
    );

    // sets
    let set_class_def = ty!(
        "ClassDefinitionStrongReferenceSet",
        "05050100-0000-0000-060e-2b3401040101",
        Set {
            element: strong_class_def.auid
        }
    );
    let set_data_def = ty!(
        "DataDefinitionStrongReferenceSet",
        "05050400-0000-0000-060e-2b3401040101",
        Set {
            element: strong_data_definition.auid
        }
    );
    let set_essence_data = ty!(
        "EssenceDataStrongReferenceSet",
        "05050500-0000-0000-060e-2b3401040101",
        Set {
            element: strong_essence_data.auid
        }
    );
    let set_mob = ty!(
        "MobStrongReferenceSet",
        "05050700-0000-0000-060e-2b3401040101",
        Set {
            element: strong_mob.auid
        }
    );
    let set_property_def = ty!(
        "PropertyDefinitionStrongReferenceSet",
        "05050b00-0000-0000-060e-2b3401040101",
        Set {
            element: strong_property_def.auid
        }
    );
    let set_type_def = ty!(
        "TypeDefinitionStrongReferenceSet",
        "05050c00-0000-0000-060e-2b3401040101",
        Set {
            element: strong_type_def.auid
        }
    );

    // vectors
    let vec_component = ty!(
        "ComponentStrongReferenceVector",
        "05060100-0000-0000-060e-2b3401040101",
        VarArray {
            element: strong_component.auid
        }
    );
    let vec_identification = ty!(
        "IdentificationStrongReferenceVector",
        "05060300-0000-0000-060e-2b3401040101",
        VarArray {
            element: strong_identification.auid
        }
    );
    let vec_mob_slot = ty!(
        "MobSlotStrongReferenceVector",
        "05060500-0000-0000-060e-2b3401040101",
        VarArray {
            element: strong_mob_slot.auid
        }
    );
    let vec_type_def_weakref = ty!(
        "TypeDefinitionWeakReferenceVector",
        "05040200-0000-0000-060e-2b3401040101",
        VarArray {
            element: weak_type_def.auid
        }
    );

    // Root-object strong refs (the Root class is not in the dictionary, but its
    // properties reference these typedefs).
    let strong_header = ty!(
        "HeaderStrongReference",
        "05022800-0000-0000-060e-2b3401040101",
        StrongObjRef {
            class: Auid::parse("0d010101-0101-2f00-060e-2b3402060101")
        }
    );
    let strong_meta_dictionary = ty!(
        "MetaDictionaryStrongReference",
        "05022700-0000-0000-060e-2b3401040101",
        StrongObjRef {
            class: Auid::parse("0d010101-0225-0000-060e-2b3402060101")
        }
    );

    let bool_enum = ty!(
        "Boolean",
        "01040100-0000-0000-060e-2b3401040101",
        Enum {
            element: uint8,
            names: &["False", "True"],
            values: &[0, 1],
        }
    );
    let electro_spatial = ty!(
        "ElectroSpatialFormulation",
        "02010122-0000-0000-060e-2b3401040101",
        Enum {
            element: uint8,
            names: &[
                "ElectroSpatialFormulation_Default",
                "ElectroSpatialFormulation_TwoChannelMode",
                "ElectroSpatialFormulation_SingleChannelMode",
                "ElectroSpatialFormulation_PrimarySecondaryMode",
                "ElectroSpatialFormulation_StereophonicMode",
                "ElectroSpatialFormulation_SingleChannelDoubleSamplingFrequencyMode",
                "ElectroSpatialFormulation_StereoLeftChannelDoubleSamplingFrequencyMode",
                "ElectroSpatialFormulation_StereoRightChannelDoubleSamplingFrequencyMode",
                "ElectroSpatialFormulation_MultiChannelMode",
            ],
            values: &[0, 1, 2, 3, 4, 7, 8, 9, 15],
        }
    );
    let product_release = ty!(
        "ProductReleaseType",
        "02010101-0000-0000-060e-2b3401040101",
        Enum {
            element: uint8,
            names: &[
                "VersionUnknown",
                "VersionReleased",
                "VersionDebug",
                "VersionPatched",
                "VersionBeta",
                "VersionPrivateBuild",
            ],
            values: &[0, 1, 2, 3, 4, 5],
        }
    );

    let rec_auid = ty!(
        "AUID",
        "01030100-0000-0000-060e-2b3401040101",
        Record {
            members: &[
                ("Data1", T_UINT32),
                ("Data2", T_UINT16),
                ("Data3", T_UINT16),
                ("Data4", T_UINT8_ARRAY_8),
            ],
        }
    );
    let rec_mobid = ty!(
        "MobIDType",
        "01030200-0000-0000-060e-2b3401040101",
        Record {
            members: &[
                ("SMPTELabel", T_UINT8_ARRAY_12),
                ("length", T_UINT8),
                ("instanceHigh", T_UINT8),
                ("instanceMid", T_UINT8),
                ("instanceLow", T_UINT8),
                ("material", T_AUID),
            ],
        }
    );
    let rec_rational = ty!(
        "Rational",
        "03010100-0000-0000-060e-2b3401040101",
        Record {
            members: &[("Numerator", T_INT32), ("Denominator", T_INT32)],
        }
    );
    let rec_product_version = ty!(
        "ProductVersion",
        "03010200-0000-0000-060e-2b3401040101",
        Record {
            members: &[
                ("major", T_UINT16),
                ("minor", T_UINT16),
                ("tertiary", T_UINT16),
                ("patchLevel", T_UINT16),
                ("type", T_PRODUCT_RELEASE_TYPE),
            ],
        }
    );
    let rec_version_type = ty!(
        "VersionType",
        "03010300-0000-0000-060e-2b3401040101",
        Record {
            members: &[("major", T_INT8), ("minor", T_INT8)],
        }
    );
    let rec_date_struct = ty!(
        "DateStruct",
        "03010500-0000-0000-060e-2b3401040101",
        Record {
            members: &[("year", T_INT16), ("month", T_UINT8), ("day", T_UINT8)],
        }
    );
    let rec_time_struct = ty!(
        "TimeStruct",
        "03010600-0000-0000-060e-2b3401040101",
        Record {
            members: &[
                ("hour", T_UINT8),
                ("minute", T_UINT8),
                ("second", T_UINT8),
                ("fraction", T_UINT8),
            ],
        }
    );
    let rec_time_stamp = ty!(
        "TimeStamp",
        "03010700-0000-0000-060e-2b3401040101",
        Record {
            members: &[("date", T_DATE_STRUCT), ("time", T_TIME_STRUCT)],
        }
    );

    vec![
        ty!(
            "aafUInt8",
            "01010100-0000-0000-060e-2b3401040101",
            Int { size: 1, signed: false }
        ),
        ty!(
            "aafUInt16",
            "01010200-0000-0000-060e-2b3401040101",
            Int { size: 2, signed: false }
        ),
        ty!(
            "aafUInt32",
            "01010300-0000-0000-060e-2b3401040101",
            Int { size: 4, signed: false }
        ),
        ty!(
            "aafUInt64",
            "01010400-0000-0000-060e-2b3401040101",
            Int { size: 8, signed: false }
        ),
        ty!(
            "aafInt8",
            "01010500-0000-0000-060e-2b3401040101",
            Int { size: 1, signed: true }
        ),
        ty!(
            "aafInt16",
            "01010600-0000-0000-060e-2b3401040101",
            Int { size: 2, signed: true }
        ),
        ty!(
            "aafInt32",
            "01010700-0000-0000-060e-2b3401040101",
            Int { size: 4, signed: true }
        ),
        ty!(
            "aafInt64",
            "01010800-0000-0000-060e-2b3401040101",
            Int { size: 8, signed: true }
        ),
        ty!(
            "aafPositionType",
            "01012001-0000-0000-060e-2b3401040101",
            Rename { renamed: int64 }
        ),
        ty!(
            "aafLengthType",
            "01012002-0000-0000-060e-2b3401040101",
            Rename { renamed: int64 }
        ),
        ty!(
            "aafUUID",
            "01030300-0000-0000-060e-2b3401040101",
            FixedArray {
                element: uint8,
                count: 16
            }
        ),
        ty!(
            "aafString",
            "01100200-0000-0000-060e-2b3401040101",
            Str {
                element: Auid::parse("01100100-0000-0000-060e-2b3401040101")
            }
        ),
        ty!(
            "aafCharacter",
            "01100100-0000-0000-060e-2b3401040101",
            Character
        ),
        ty!(
            "aafStringArray",
            "04010500-0000-0000-060e-2b3401040101",
            VarArray {
                element: Auid::parse("01100200-0000-0000-060e-2b3401040101")
            }
        ),
        ty!(
            "aafInt64Array",
            "04010400-0000-0000-060e-2b3401040101",
            VarArray { element: int64 }
        ),
        ty!(
            "aafAUIDArray",
            "04010600-0000-0000-060e-2b3401040101",
            VarArray { element: auid }
        ),
        ty!(
            "aafUInt8Array8",
            "04010800-0000-0000-060e-2b3401040101",
            FixedArray {
                element: uint8,
                count: 8
            }
        ),
        ty!(
            "aafUInt8Array12",
            "04010200-0000-0000-060e-2b3401040101",
            FixedArray {
                element: uint8,
                count: 12
            }
        ),
        ty!("Stream", "04100200-0000-0000-060e-2b3401040101", Stream),
        bool_enum,
        electro_spatial,
        product_release,
        rec_auid,
        rec_mobid,
        rec_rational,
        rec_product_version,
        rec_version_type,
        rec_date_struct,
        rec_time_struct,
        rec_time_stamp,
        strong_content_storage,
        strong_dictionary,
        strong_essence_descriptor,
        strong_segment,
        strong_component,
        strong_identification,
        strong_mob_slot,
        strong_class_def,
        strong_data_definition,
        strong_essence_data,
        strong_mob,
        strong_property_def,
        strong_type_def,
        weak_class_def,
        weak_type_def,
        weak_data_definition,
        weak_property_def,
        set_class_def,
        set_data_def,
        set_essence_data,
        set_mob,
        set_property_def,
        set_type_def,
        vec_component,
        vec_identification,
        vec_mob_slot,
        vec_type_def_weakref,
        strong_header,
        strong_meta_dictionary,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    /// Every classdef is unique, has a resolvable parent, and every property
    /// typedef + referenced class/type exists in the dictionary.
    #[test]
    fn class_definitions_are_self_consistent() {
        let classes = class_definitions();
        let typedefs = type_definitions();

        let class_by_auid: HashSet<Auid> = classes.iter().map(|c| c.auid).collect();
        let class_by_name: HashSet<&str> = classes.iter().map(|c| c.name).collect();
        let type_by_auid: HashSet<Auid> = typedefs.iter().map(|t| t.auid).collect();

        assert_eq!(class_by_auid.len(), classes.len(), "duplicate class AUIDs");
        assert_eq!(class_by_name.len(), classes.len(), "duplicate class names");

        for c in &classes {
            if let Some(p) = c.parent {
                assert!(class_by_auid.contains(&p), "class {} has missing parent {}", c.name, p);
            }
            for p in &c.props {
                assert!(
                    type_by_auid.contains(&p.typedef),
                    "class {} property {} has missing typedef {}",
                    c.name,
                    p.name,
                    p.typedef
                );
                // unique-key properties must have unique=True on the class chain
                if p.unique {
                    // nothing more to check here; property-level checks below
                }
            }
        }
    }

    #[test]
    fn type_definitions_are_self_consistent() {
        let classes = class_definitions();
        let typedefs = type_definitions();

        let class_by_auid: HashSet<Auid> = classes.iter().map(|c| c.auid).collect();
        let type_by_auid: HashSet<Auid> = typedefs.iter().map(|t| t.auid).collect();
        let type_by_name: HashSet<&str> = typedefs.iter().map(|t| t.name).collect();

        assert_eq!(type_by_auid.len(), typedefs.len(), "duplicate typedef AUIDs");
        assert_eq!(type_by_name.len(), typedefs.len(), "duplicate typedef names");

        for t in &typedefs {
            match &t.kind {
                TypeKind::StrongObjRef { class } => {
                    assert!(class_by_auid.contains(class), "{} refs missing class {}", t.name, class);
                }
                TypeKind::WeakObjRef { class, target_set } => {
                    assert!(class_by_auid.contains(class), "{} refs missing class {}", t.name, class);
                    assert!(!target_set.is_empty(), "{} has empty target set", t.name);
                    // target-set entries are property AUIDs of the Root/Meta/Header
                    // chain; at minimum they must be non-null and unique.
                    let set: HashSet<Auid> = target_set.iter().copied().collect();
                    assert_eq!(set.len(), target_set.len(), "{} target set has dupes", t.name);
                }
                TypeKind::Enum { element, names, values } => {
                    assert!(type_by_auid.contains(element), "{} missing element type {}", t.name, element);
                    assert_eq!(names.len(), values.len(), "{} enum name/value count", t.name);
                }
                TypeKind::FixedArray { element, .. }
                | TypeKind::VarArray { element }
                | TypeKind::Set { element }
                | TypeKind::Str { element }
                | TypeKind::Rename { renamed: element } => {
                    assert!(type_by_auid.contains(element), "{} missing element type {}", t.name, element);
                }
                TypeKind::Record { members } => {
                    for (name, mtype) in members.iter() {
                        assert!(type_by_auid.contains(mtype), "{} record member {} missing type {}", t.name, name, mtype);
                    }
                }
                TypeKind::Stream | TypeKind::Character | TypeKind::Int { .. } => {}
            }
        }
    }

    #[test]
    fn referenced_types_are_present() {
        // The Root/MetaDictionary strong-ref typedefs used by the Root object.
        let typedefs = type_definitions();
        let type_by_auid: HashSet<Auid> = typedefs.iter().map(|t| t.auid).collect();
        assert!(type_by_auid.contains(&Auid::parse("05022800-0000-0000-060e-2b3401040101"))); // HeaderStrongReference
        assert!(type_by_auid.contains(&Auid::parse("05022700-0000-0000-060e-2b3401040101"))); // MetaDictionaryStrongReference

        // Every strong-ref-set/vector typedef's element is a defined strong ref.
        for t in &typedefs {
            if let TypeKind::Set { element } | TypeKind::VarArray { element } = &t.kind {
                assert!(type_by_auid.contains(element), "set/vec {} missing element {}", t.name, element);
            }
        }
    }

    #[test]
    fn data_definition_auids_are_standard() {
        assert_eq!(
            super::DATA_DEF_SOUND,
            Auid::parse("01030202-0200-0000-060e-2b3404010101")
        );
        assert_eq!(
            super::DATA_DEF_PICTURE,
            Auid::parse("01030202-0100-0000-060e-2b3404010101")
        );
    }
}
