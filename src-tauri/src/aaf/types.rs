//! Binary primitives for AAF serialization (Phase 4.5).
//!
//! Every value in an AAF file is stored little-endian; AUIDs and MobIDs are
//! stored in *mixed-endian* `bytes_le` layout (data1/data2/data3 LE, data4 raw),
//! matching both the SMPTE UMID convention and the CLSID layout the `cfb`
//! crate writes for directory entries.

use chrono::{DateTime, Datelike, Timelike, Utc};
use uuid::Uuid;

/// 16-byte AAF Unique Identifier, stored on disk as `bytes_le`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Auid(pub Uuid);

impl Auid {
    pub const fn from_bytes(bytes: [u8; 16]) -> Self {
        Auid(Uuid::from_bytes(bytes))
    }

    /// Parse a canonical hex form such as `"0d010101-0101-2f00-060e-2b3402060101"`.
    /// Const-friendly (no allocation), so it can appear in `pub const` items.
    pub const fn parse(hex: &str) -> Self {
        let bytes = hex.as_bytes();
        let mut out = [0u8; 16];
        let mut byte_idx = 0usize;
        let mut i = 0usize;
        let mut hi = 0u8;
        let mut is_hi = true;
        while i < bytes.len() && byte_idx < 16 {
            let c = bytes[i];
            i += 1;
            let v = match c {
                b'0'..=b'9' => c - b'0',
                b'a'..=b'f' => c - b'a' + 10,
                b'A'..=b'F' => c - b'A' + 10,
                _ => continue, // skip '-'
            };
            if is_hi {
                hi = v;
                is_hi = false;
            } else {
                out[byte_idx] = (hi << 4) | v;
                byte_idx += 1;
                is_hi = true;
            }
        }
        Auid(Uuid::from_bytes(out))
    }

    pub fn to_bytes_le(&self) -> [u8; 16] {
        self.0.to_bytes_le()
    }

    /// Build a `uuid::Uuid` whose on-disk CLSID (as written by the `cfb` crate,
    /// `d1 LE + d2 LE + d3 LE + d4`) equals this AUID's `bytes_le` layout —
    /// the exact representation AAF readers expect in a directory-entry CLSID.
    pub fn to_clsid(&self) -> Uuid {
        let ble = self.to_bytes_le();
        let d1 = u32::from_le_bytes([ble[0], ble[1], ble[2], ble[3]]);
        let d2 = u16::from_le_bytes([ble[4], ble[5]]);
        let d3 = u16::from_le_bytes([ble[6], ble[7]]);
        let d4: [u8; 8] = ble[8..16].try_into().unwrap();
        Uuid::from_fields(d1, d2, d3, &d4)
    }

    pub fn as_uuid(&self) -> Uuid {
        self.0
    }
}

impl std::fmt::Display for Auid {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// The SMPTE UMID prefix for AAF material (12 bytes) + the Basic UMID length
/// byte (`0x13`) + zero instance bytes. Matches pyaaf2 `UniqueMobID()`.
const MOBID_LABEL: [u8; 16] = [
    0x06, 0x0a, 0x2b, 0x34, 0x01, 0x01, 0x01, 0x05, 0x01, 0x01, 0x0f, 0x20, 0x13, 0x00, 0x00,
    0x00,
];

/// 32-byte SMPTE UMID that uniquely identifies a Mob (and its EssenceData).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct MobId(pub [u8; 32]);

impl MobId {
    /// A null MobID (all zeroes) — used for source-clips inside a SourceMob's
    /// own slot, which reference no other mob.
    pub fn null() -> Self {
        MobId([0u8; 32])
    }

    /// A fresh unique MobID: standard SMPTE label + 16-byte random material.
    pub fn new() -> Self {
        let mut bytes = [0u8; 32];
        bytes[..16].copy_from_slice(&MOBID_LABEL);
        bytes[16..].copy_from_slice(&Uuid::new_v4().to_bytes_le());
        MobId(bytes)
    }

    pub fn is_null(&self) -> bool {
        self.0.iter().all(|&b| b == 0)
    }
}

impl Default for MobId {
    fn default() -> Self {
        Self::new()
    }
}

/// A rational number (e.g. an edit rate of 48000/1). On disk: two little-endian
/// u32s.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rational {
    pub numerator: u32,
    pub denominator: u32,
}

impl Rational {
    pub fn new(numerator: u32, denominator: u32) -> Self {
        Rational {
            numerator,
            denominator,
        }
    }
}

// ---------------------------------------------------------------------------
// Byte writers
// ---------------------------------------------------------------------------

pub fn put_u8(out: &mut Vec<u8>, v: u8) {
    out.push(v);
}

pub fn put_u16(out: &mut Vec<u8>, v: u16) {
    out.extend_from_slice(&v.to_le_bytes());
}

pub fn put_u32(out: &mut Vec<u8>, v: u32) {
    out.extend_from_slice(&v.to_le_bytes());
}

pub fn put_u64(out: &mut Vec<u8>, v: u64) {
    out.extend_from_slice(&v.to_le_bytes());
}

pub fn put_i8(out: &mut Vec<u8>, v: i8) {
    out.push(v as u8);
}

pub fn put_i16(out: &mut Vec<u8>, v: i16) {
    out.extend_from_slice(&v.to_le_bytes());
}

pub fn put_i32(out: &mut Vec<u8>, v: i32) {
    out.extend_from_slice(&v.to_le_bytes());
}

pub fn put_i64(out: &mut Vec<u8>, v: i64) {
    out.extend_from_slice(&v.to_le_bytes());
}

/// UTF-16LE string, null-terminated (AAF string property encoding).
pub fn put_utf16le(out: &mut Vec<u8>, s: &str) {
    let mut code_units: Vec<u16> = Vec::with_capacity(s.len());
    for c in s.encode_utf16() {
        code_units.push(c);
    }
    for cu in code_units {
        out.extend_from_slice(&cu.to_le_bytes());
    }
    out.extend_from_slice(&[0u8, 0u8]);
}

/// AUID in its on-disk `bytes_le` layout.
pub fn put_auid_le(out: &mut Vec<u8>, a: &Auid) {
    out.extend_from_slice(&a.to_bytes_le());
}

/// MobID (32 bytes, little-endian layout).
pub fn put_mobid_le(out: &mut Vec<u8>, m: &MobId) {
    out.extend_from_slice(&m.0);
}

/// Rational (u32 numerator, u32 denominator).
pub fn put_rational(out: &mut Vec<u8>, r: &Rational) {
    put_u32(out, r.numerator);
    put_u32(out, r.denominator);
}

/// AAF VersionType: `i8 major, i8 minor`.
pub fn put_version_type(out: &mut Vec<u8>, major: i8, minor: i8) {
    put_i8(out, major);
    put_i8(out, minor);
}

/// AAF ProductVersion: 4 × u16 (major/minor/tertiary/patchLevel) + u16 release-type.
pub fn put_product_version(out: &mut Vec<u8>, major: u16, minor: u16, tertiary: u16, patch: u16, release_type: u16) {
    put_u16(out, major);
    put_u16(out, minor);
    put_u16(out, tertiary);
    put_u16(out, patch);
    put_u16(out, release_type);
}

/// AAF TimeStamp: `DateStruct{year i16, month u8, day u8}` +
/// `TimeStruct{hour u8, minute u8, second u8, fraction u8}` (8 bytes).
pub fn put_timestamp(out: &mut Vec<u8>, t: &DateTime<Utc>) {
    put_i16(out, t.year() as i16);
    put_u8(out, t.month() as u8);
    put_u8(out, t.day() as u8);
    put_u8(out, t.hour() as u8);
    put_u8(out, t.minute() as u8);
    put_u8(out, t.second() as u8);
    put_u8(out, 0); // fraction
}

// ---------------------------------------------------------------------------
// Convenience encoders returning a fresh Vec (for building property values)
// ---------------------------------------------------------------------------

pub fn enc_u8(v: u8) -> Vec<u8> {
    let mut o = Vec::new();
    put_u8(&mut o, v);
    o
}

pub fn enc_u16(v: u16) -> Vec<u8> {
    let mut o = Vec::new();
    put_u16(&mut o, v);
    o
}

pub fn enc_u32(v: u32) -> Vec<u8> {
    let mut o = Vec::new();
    put_u32(&mut o, v);
    o
}

pub fn enc_i64(v: i64) -> Vec<u8> {
    let mut o = Vec::new();
    put_i64(&mut o, v);
    o
}

pub fn enc_bool(v: bool) -> Vec<u8> {
    vec![if v { 1 } else { 0 }]
}

pub fn enc_str(s: &str) -> Vec<u8> {
    let mut o = Vec::new();
    put_utf16le(&mut o, s);
    o
}

pub fn enc_auid(a: &Auid) -> Vec<u8> {
    a.to_bytes_le().to_vec()
}

pub fn enc_mobid(m: &MobId) -> Vec<u8> {
    m.0.to_vec()
}

pub fn enc_rational(r: &Rational) -> Vec<u8> {
    let mut o = Vec::new();
    put_rational(&mut o, r);
    o
}

pub fn enc_timestamp(t: &DateTime<Utc>) -> Vec<u8> {
    let mut o = Vec::new();
    put_timestamp(&mut o, t);
    o
}

pub fn enc_version_type(major: i8, minor: i8) -> Vec<u8> {
    let mut o = Vec::new();
    put_version_type(&mut o, major, minor);
    o
}

pub fn enc_product_version(major: u16, minor: u16, tertiary: u16, patch: u16, release_type: u16) -> Vec<u8> {
    let mut o = Vec::new();
    put_product_version(&mut o, major, minor, tertiary, patch, release_type);
    o
}

/// A UTF-16LE array: each string null-terminated and concatenated (AAF string
/// array encoding). Matches pyaaf2 `encode_utf16_array`.
pub fn enc_utf16_array(items: &[&str]) -> Vec<u8> {
    let mut o = Vec::new();
    for s in items {
        put_utf16le(&mut o, s);
    }
    o
}

/// A signed 64-bit little-endian array (enum element values).
pub fn enc_s64_array(values: &[i64]) -> Vec<u8> {
    let mut o = Vec::new();
    for v in values {
        put_i64(&mut o, *v);
    }
    o
}

/// An AUID array (little-endian layout).
pub fn enc_auid_array(items: &[Auid]) -> Vec<u8> {
    let mut o = Vec::new();
    for a in items {
        put_auid_le(&mut o, a);
    }
    o
}

// ---------------------------------------------------------------------------
// Name mangling (AAF child-storage naming)
// ---------------------------------------------------------------------------

/// Squeeze a name to `size` chars by keeping the head/tail and replacing the
/// middle with a single `-`. Matches pyaaf2 `squeeze_name`.
pub fn squeeze_name(name: &str, size: usize) -> String {
    if name.len() <= size {
        return name.to_string();
    }
    let half = size / 2;
    let mut out = String::with_capacity(size);
    for i in 0..size {
        if i < half {
            out.push(name.chars().nth(i).unwrap_or('_'));
        } else if i == half {
            out.push('-');
        } else {
            let from_end = size - i;
            let idx = name.len().saturating_sub(from_end);
            out.push(name.chars().nth(idx).unwrap_or('_'));
        }
    }
    out
}

/// Build the child-storage/index name for a property:
/// `"{squeezed-name}-{pid:#x}"`. Matches pyaaf2 `mangle_name(name, pid, size)`.
pub fn mangle_name(name: &str, pid: u16, size: usize) -> String {
    let p = format!("{:x}", pid);
    let max_size = size.saturating_sub(p.len() + 2);
    let squeezed = squeeze_name(name, max_size);
    format!("{}-{}", squeezed, p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mangle_header() {
        assert_eq!(mangle_name("Header", 0x0002, 32), "Header-2");
        assert_eq!(mangle_name("MetaDictionary", 0x0001, 32), "MetaDictionary-1");
    }

    #[test]
    fn mangle_set_name_truncates() {
        // 22-char budget (sets/vectors), pid 0x1901 → name squeezed to 16
        let n = mangle_name("Mobs", 0x1901, 22);
        assert_eq!(n, "Mobs-1901");
        let n2 = mangle_name("IdentificationList", 0x3b06, 22);
        assert!(n2.ends_with("-3b06"));
        // "IdentificationList" (18) squeezed to 16 → 16 + "-" + "3b06" = 21
        assert_eq!(n2.len(), 21);
    }

    #[test]
    fn auid_le_layout() {
        // Header class AUID; mixed-endian on disk.
        let a = Auid::parse("0d010101-0101-2f00-060e-2b3402060101");
        let bytes = a.to_bytes_le();
        assert_eq!(
            bytes,
            [0x01, 0x01, 0x01, 0x0d, 0x01, 0x01, 0x00, 0x2f, 0x06, 0x0e, 0x2b, 0x34, 0x02, 0x06,
             0x01, 0x01]
        );
    }

    #[test]
    fn mobid_layout() {
        let m = MobId::null();
        assert!(m.is_null());
        assert_eq!(m.0.len(), 32);

        let m2 = MobId::new();
        assert!(!m2.is_null());
        // SMPTE label prefix
        assert_eq!(&m2.0[..12], &[0x06, 0x0a, 0x2b, 0x34, 0x01, 0x01, 0x01, 0x05, 0x01, 0x01, 0x0f, 0x20]);
        assert_eq!(m2.0[12], 0x13); // Basic UMID length
        assert_ne!(MobId::new().0[16..], [0u8; 16]);
    }

    #[test]
    fn encoders_are_little_endian() {
        let mut out = Vec::new();
        put_u16(&mut out, 0x4949);
        assert_eq!(out, [0x49, 0x49]);
        put_u32(&mut out, 48000);
        assert_eq!(&out[2..], &[0x80, 0xbb, 0x00, 0x00]);
        put_i64(&mut out, 123456);
        assert_eq!(out.len(), 14);
    }

    #[test]
    fn utf16_null_terminated() {
        let mut out = Vec::new();
        put_utf16le(&mut out, "Hi");
        assert_eq!(out, [0x48, 0x00, 0x69, 0x00, 0x00, 0x00]);
    }

    #[test]
    fn rational_encoding() {
        let mut out = Vec::new();
        put_rational(&mut out, &Rational::new(48000, 1));
        assert_eq!(out.len(), 8);
        assert_eq!(&out[..4], &[0x80, 0xbb, 0x00, 0x00]);
        assert_eq!(&out[4..], &[1, 0, 0, 0]);
    }

    #[test]
    fn timestamp_encoding() {
        let mut out = Vec::new();
        let t: DateTime<Utc> = "2026-08-03T04:30:15Z".parse().unwrap();
        put_timestamp(&mut out, &t);
        assert_eq!(out.len(), 8);
        // year i16 LE (2026 = 0x07EA)
        assert_eq!(&out[..2], &[0xEA, 0x07]);
        assert_eq!(out[2], 8); // month
        assert_eq!(out[3], 3); // day
        assert_eq!(out[4], 4); // hour
        assert_eq!(out[5], 30); // minute
        assert_eq!(out[6], 15); // second
        assert_eq!(out[7], 0); // fraction
    }
}
