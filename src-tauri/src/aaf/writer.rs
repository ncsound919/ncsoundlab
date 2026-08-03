//! AAF object-graph → CFB file serialization (Phase 4.5).
//!
//! AAF objects are CFB storages whose CLSID is the object's class AUID and
//! which contain a `properties` stream plus optional index/essence streams.
//! This module walks a flat list of `Object`s (each carrying its full CFB
//! path) and writes them into a `cfb::CompoundFile`.

use std::io::Write;

use crate::aaf::types::{put_u8, put_u16, put_u32, put_utf16le, mangle_name, Auid};

// Storage formats
pub const SF_DATA: u16 = 0x82;
pub const SF_DATA_STREAM: u16 = 0x42;
pub const SF_STRONG_OBJECT_REFERENCE: u16 = 0x22;
pub const SF_STRONG_OBJECT_REFERENCE_VECTOR: u16 = 0x32;
pub const SF_STRONG_OBJECT_REFERENCE_SET: u16 = 0x3a;
pub const SF_WEAK_OBJECT_REFERENCE: u16 = 0x02;
pub const SF_WEAK_OBJECT_REFERENCE_VECTOR: u16 = 0x12;

const PROPERTY_VERSION: u8 = 32;
const BYTE_ORDER_LITTLE: u8 = 0x4c;

/// Weak-reference root→set pid paths, in a fixed order. Indexes are baked into
/// weak-ref property data, so this order must match `WeakRef.index`.
pub const WEAKREF_PATHS: &[&[u16]] = &[
    &[0x0001, 0x0003],              // 0 ClassDefinitionWeakReference
    &[0x0001, 0x0004],              // 1 TypeDefinitionWeakReference
    &[0x0002, 0x3b04, 0x2605],      // 2 DataDefinitionWeakReference
    &[0x0001, 0x0003, 0x0009],      // 3 PropertyDefinitionWeakReference
];

/// A single property value, before the `properties` stream is assembled.
#[derive(Debug, Clone)]
pub enum Prop {
    /// SF_DATA — raw value bytes already encoded (string/int/AUID/MobID/…).
    Data(Vec<u8>),
    /// SF_STRONG_OBJECT_REFERENCE — child storage name (leaf, e.g. "Content-3b03").
    StrongRef(String),
    /// SF_STRONG_OBJECT_REFERENCE_VECTOR — child storage names + index.
    StrongRefVec { index_name: String, children: Vec<String> },
    /// SF_STRONG_OBJECT_REFERENCE_SET — child storages keyed by a unique value.
    StrongRefSet {
        index_name: String,
        key_pid: u16,
        key_size: u8,
        children: Vec<(Vec<u8>, String)>,
    },
    /// SF_WEAK_OBJECT_REFERENCE — index into the referenced-properties table.
    WeakRef {
        index: u16,
        key_pid: u16,
        key_size: u8,
        key: Vec<u8>,
    },
    /// SF_WEAK_OBJECT_REFERENCE_VECTOR — weak-ref vector (index stream only).
    WeakRefVec {
        index_name: String,
        index: u16,
        key_pid: u16,
        key_size: u8,
        keys: Vec<Vec<u8>>,
    },
    /// SF_DATA_STREAM — essence stream; `data` goes to `path/stream_name`.
    Stream { stream_name: String, data: Vec<u8> },
}

/// The on-disk format code + encoded value bytes for a property.
impl Prop {
    fn format(&self) -> u16 {
        match self {
            Prop::Data(_) => SF_DATA,
            Prop::StrongRef(_) => SF_STRONG_OBJECT_REFERENCE,
            Prop::StrongRefVec { .. } => SF_STRONG_OBJECT_REFERENCE_VECTOR,
            Prop::StrongRefSet { .. } => SF_STRONG_OBJECT_REFERENCE_SET,
            Prop::WeakRef { .. } => SF_WEAK_OBJECT_REFERENCE,
            Prop::WeakRefVec { .. } => SF_WEAK_OBJECT_REFERENCE_VECTOR,
            Prop::Stream { .. } => SF_DATA_STREAM,
        }
    }

    /// The bytes that go inside the `properties` stream for this property.
    fn encoded_data(&self) -> Vec<u8> {
        match self {
            Prop::Data(b) => b.clone(),
            Prop::StrongRef(name) => {
                let mut out = Vec::new();
                put_utf16le(&mut out, name);
                out
            }
            Prop::StrongRefVec { index_name, .. } => {
                let mut out = Vec::new();
                put_utf16le(&mut out, index_name);
                out
            }
            Prop::StrongRefSet { index_name, .. } => {
                let mut out = Vec::new();
                put_utf16le(&mut out, index_name);
                out
            }
            Prop::WeakRef {
                index,
                key_pid,
                key_size,
                key,
            } => {
                let mut out = Vec::new();
                put_u16(&mut out, *index);
                put_u16(&mut out, *key_pid);
                put_u8(&mut out, *key_size);
                out.extend_from_slice(key);
                out
            }
            Prop::WeakRefVec {
                index_name,
                index,
                key_pid,
                key_size,
                keys,
            } => {
                // Data portion = utf16le(index name); keys go into the index stream.
                let mut out = Vec::new();
                put_utf16le(&mut out, index_name);
                let _ = (*index, *key_pid, *key_size, keys);
                out
            }
            Prop::Stream { stream_name, .. } => {
                let mut out = Vec::new();
                put_u8(&mut out, 0x55); // unspecified endianness
                put_utf16le(&mut out, stream_name);
                out
            }
        }
    }

    fn index_stream(&self) -> Option<(String, Vec<u8>)> {
        match self {
            Prop::StrongRefVec { index_name, children } => {
                let mut out = Vec::new();
                let count = children.len() as u32;
                put_u32(&mut out, count);
                put_u32(&mut out, count); // next_free_key
                put_u32(&mut out, 0xFFFFFFFF); // last_free_key
                for i in 0..count {
                    put_u32(&mut out, i);
                }
                Some((format!("{} index", index_name), out))
            }
            Prop::StrongRefSet {
                index_name,
                key_pid,
                key_size,
                children,
            } => {
                let mut out = Vec::new();
                let count = children.len() as u32;
                put_u32(&mut out, count);
                put_u32(&mut out, count); // next_free_key
                put_u32(&mut out, 0xFFFFFFFF); // last_free_key
                put_u16(&mut out, *key_pid);
                put_u8(&mut out, *key_size);
                for (i, (key, _)) in children.iter().enumerate() {
                    put_u32(&mut out, i as u32);
                    put_u32(&mut out, 1); // ref count
                    out.extend_from_slice(key);
                }
                Some((format!("{} index", index_name), out))
            }
            Prop::WeakRefVec {
                index_name,
                index,
                key_pid,
                key_size,
                keys,
            } => {
                let mut out = Vec::new();
                let count = keys.len() as u32;
                put_u32(&mut out, count);
                put_u16(&mut out, *index);
                put_u16(&mut out, *key_pid);
                put_u8(&mut out, *key_size);
                for k in keys {
                    out.extend_from_slice(k);
                }
                Some((format!("{} index", index_name), out))
            }
            _ => None,
        }
    }
}

/// A complete AAF object (storage) to write.
#[derive(Debug, Clone)]
pub struct Object {
    /// Full CFB path, e.g. `/Root`, `/Root/Header-2`, `/Root/Header-2/Content-3b03`.
    pub path: String,
    pub class_id: Auid,
    /// `(pid, value)` pairs.
    pub props: Vec<(u16, Prop)>,
}

impl Object {
    pub fn new(path: impl Into<String>, class_id: Auid) -> Self {
        Object {
            path: path.into(),
            class_id,
            props: Vec::new(),
        }
    }

    pub fn data(mut self, pid: u16, bytes: Vec<u8>) -> Self {
        self.props.push((pid, Prop::Data(bytes)));
        self
    }

    pub fn strong_ref(mut self, pid: u16, child: String) -> Self {
        self.props.push((pid, Prop::StrongRef(child)));
        self
    }
}

/// Assemble a `properties` stream from a list of `(pid, prop)`.
fn build_properties_stream(props: &[(u16, Prop)]) -> Vec<u8> {
    let mut out = Vec::new();
    put_u8(&mut out, BYTE_ORDER_LITTLE);
    put_u8(&mut out, PROPERTY_VERSION);
    put_u16(&mut out, props.len() as u16);

    for (pid, prop) in props {
        put_u16(&mut out, *pid);
        put_u16(&mut out, prop.format());
        put_u16(&mut out, prop.encoded_data().len() as u16);
    }
    for (_pid, prop) in props {
        out.extend_from_slice(&prop.encoded_data());
    }
    out
}

fn build_referenced_properties() -> Vec<u8> {
    let mut out = Vec::new();
    put_u8(&mut out, BYTE_ORDER_LITTLE);
    put_u16(&mut out, WEAKREF_PATHS.len() as u16);
    let pid_count: u32 = WEAKREF_PATHS.iter().map(|p| (p.len() + 1) as u32).sum();
    put_u32(&mut out, pid_count);
    for path in WEAKREF_PATHS {
        for pid in *path {
            put_u16(&mut out, *pid);
        }
        put_u16(&mut out, 0); // null terminator
    }
    out
}

/// Write the given objects into a new in-memory AAF/CFB byte buffer.
///
/// `objects` must include `/Root` and the `"/Root/referenced properties"`
/// stream is written automatically.
pub fn write_aaf(objects: &[Object]) -> std::io::Result<Vec<u8>> {
    let cursor = std::io::Cursor::new(Vec::new());
    let mut comp = cfb::CompoundFile::create(cursor)?;

    // Root storage already exists in a new CFB; set its CLSID to the Root class.
    comp.set_storage_clsid("/", crate::aaf::dict::CLASS_ROOT.to_clsid())?;

    // Parents must exist before children — sort by path depth.
    let mut sorted: Vec<&Object> = objects.iter().collect();
    sorted.sort_by_key(|o| o.path.matches('/').count());

    for obj in sorted {
        if obj.path != "/" {
            comp.create_storage(&obj.path)?;
            comp.set_storage_clsid(&obj.path, obj.class_id.to_clsid())?;
        }

        // properties stream
        {
            let bytes = build_properties_stream(&obj.props);
            let path = format!("{}/properties", obj.path);
            let mut s = comp.create_stream(&path)?;
            s.write_all(&bytes)?;
        }

        // index + essence streams
        for (pid, prop) in &obj.props {
            if let Some((name, bytes)) = prop.index_stream() {
                let path = format!("{}/{}", obj.path, name);
                let mut s = comp.create_stream(&path)?;
                s.write_all(&bytes)?;
            }
            if let Prop::Stream { stream_name, data } = prop {
                let path = format!("{}/{}", obj.path, stream_name);
                let mut s = comp.create_stream(&path)?;
                s.write_all(data)?;
            }
            let _ = pid;
        }
    }

    // /referenced properties stream at root
    {
        let mut s = comp.create_stream("/referenced properties")?;
        s.write_all(&build_referenced_properties())?;
    }

    comp.flush()?;
    let cursor = comp.into_inner();
    Ok(cursor.into_inner())
}

/// Build the leaf storage name for a strong-ref child:
/// `mangle_name(property_name, pid, 32)`.
pub fn ref_name(name: &str, pid: u16) -> String {
    mangle_name(name, pid, 32)
}

/// Build the set/vector index name for a property: `mangle_name(name, pid, 22)`.
pub fn index_name(name: &str, pid: u16) -> String {
    mangle_name(name, pid, 22)
}

/// Build a set/vector child storage name: `"<indexName>{<localKey:#x>}"`.
pub fn set_child_name(index: &str, local_key: usize) -> String {
    format!("{}{{{:x}}}", index, local_key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aaf::types::Auid;
    use std::io::Read;

    const CLASS_HEADER: Auid = Auid::parse("0d010101-0101-2f00-060e-2b3402060101");

    #[test]
    fn properties_stream_header() {
        let props = vec![(0x3b01u16, Prop::Data(vec![0x49, 0x49]))];
        let bytes = build_properties_stream(&props);
        assert_eq!(&bytes[..4], &[0x4c, 32, 1, 0]);
        assert_eq!(&bytes[4..10], &[0x01, 0x3b, 0x82, 0x00, 0x02, 0x00]);
        assert_eq!(&bytes[10..12], &[0x49, 0x49]);
    }

    #[test]
    fn strong_ref_encoded_utf16() {
        let p = Prop::StrongRef("Content-3b03".to_string());
        let data = p.encoded_data();
        // "Content-3b03" in UTF-16LE + null terminator
        assert_eq!(data.len(), 26);
        assert_eq!(&data[data.len() - 2..], &[0, 0]);
    }

    #[test]
    fn set_index_stream() {
        let key1: Vec<u8> = crate::aaf::types::MobId::new().0.to_vec();
        let p = Prop::StrongRefSet {
            index_name: "Mobs-1901".into(),
            key_pid: 0x4401,
            key_size: 32,
            children: vec![(key1, "Mobs-1901{0}".into())],
        };
        let (name, bytes) = p.index_stream().unwrap();
        assert_eq!(name, "Mobs-1901 index");
        // header(15) + {local_key(4) + ref_count(4) + key(32)}
        assert_eq!(bytes.len(), 15 + 40);
        assert_eq!(&bytes[..4], &[1, 0, 0, 0]); // count
        assert_eq!(&bytes[12..14], &[0x01, 0x44]); // key_pid
        assert_eq!(bytes[14], 32); // key_size
    }

    #[test]
    fn writes_and_reads_back_storage() {
        let obj = Object {
            path: "/Header-2".into(),
            class_id: CLASS_HEADER,
            props: vec![
                (
                    0x3b01,
                    Prop::Data(vec![0x49, 0x49]),
                ),
                (
                    0x3b05,
                    Prop::Data(vec![1, 2]), // VersionType
                ),
            ],
        };
        let bytes = write_aaf(&[obj]).unwrap();
        assert!(bytes.len() > 512);

        let mut comp = cfb::CompoundFile::open(std::io::Cursor::new(bytes)).unwrap();
        assert!(comp.is_storage("/Header-2"));
        let mut s = comp.open_stream("/Header-2/properties").unwrap();
        let mut props_bytes = Vec::new();
        s.read_to_end(&mut props_bytes).unwrap();
        assert_eq!(&props_bytes[..4], &[0x4c, 32, 2, 0]);
    }

    #[test]
    fn mangle_and_child_names() {
        assert_eq!(ref_name("Header", 0x0002), "Header-2");
        assert_eq!(index_name("Mobs", 0x1901), "Mobs-1901");
        assert_eq!(set_child_name("Mobs-1901", 0), "Mobs-1901{0}");
    }

    #[test]
    fn weakref_encoding() {
        let mut data = Vec::new();
        crate::aaf::types::put_u16(&mut data, 2);
        crate::aaf::types::put_u16(&mut data, 0x1b01);
        crate::aaf::types::put_u8(&mut data, 16);
        data.extend_from_slice(
            &Auid::parse("01030202-0200-0000-060e-2b3404010101").to_bytes_le(),
        );
        assert_eq!(data.len(), 5 + 16);
    }
}
