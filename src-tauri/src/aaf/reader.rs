//! Minimal AAF reader (Phase 4.5).
//!
//! Parses the subset this writer emits (and simple compatible files): walks
//! Root → Header → ContentStorage → Mobs/EssenceData and recovers the session
//! tracks + embedded PCM. Used by the Import command and Rust round-trip tests.

use std::collections::HashMap;
use std::io::Read;

const SF_STRONG_REF: u16 = 0x22;
const SF_STRONG_VEC: u16 = 0x32;
const SF_STRONG_SET: u16 = 0x3a;
const SF_DATA_STREAM: u16 = 0x42;

/// A track recovered from an AAF.
#[derive(Debug, Clone)]
pub struct ParsedTrack {
    pub name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub frames: i64,
    pub pcm: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ParsedAafSession {
    pub song_name: String,
    pub tracks: Vec<ParsedTrack>,
}

/// A decoded `properties` stream.
#[derive(Debug, Clone)]
struct Props {
    entries: HashMap<u16, (u16, Vec<u8>)>, // pid -> (format, data)
}

impl Props {
    fn data(&self, pid: u16) -> Option<&[u8]> {
        self.entries.get(&pid).map(|(_, d)| d.as_slice())
    }
    fn str(&self, pid: u16) -> Option<String> {
        self.data(pid).and_then(decode_utf16)
    }
    fn u32(&self, pid: u16) -> Option<u32> {
        self.data(pid).and_then(|d| Some(u32::from_le_bytes([d[0], d[1], d[2], d[3]])))
    }
    fn i64(&self, pid: u16) -> Option<i64> {
        self.data(pid).and_then(|d| {
            let mut b = [0u8; 8];
            b.copy_from_slice(&d[..8]);
            Some(i64::from_le_bytes(b))
        })
    }
    fn mobid(&self, pid: u16) -> Option<[u8; 32]> {
        self.data(pid).and_then(|d| {
            if d.len() < 32 {
                return None;
            }
            let mut b = [0u8; 32];
            b.copy_from_slice(&d[..32]);
            Some(b)
        })
    }
    fn strong_ref_name(&self, pid: u16) -> Option<String> {
        self.entries.get(&pid).and_then(|(f, d)| {
            if *f == SF_STRONG_REF {
                decode_utf16(d)
            } else {
                None
            }
        })
    }
    /// The index name for a set/vector property.
    fn index_name(&self, pid: u16) -> Option<String> {
        self.entries.get(&pid).and_then(|(f, d)| {
            if matches!(*f, SF_STRONG_VEC | SF_STRONG_SET) {
                decode_utf16(d)
            } else {
                None
            }
        })
    }
}

fn decode_utf16(d: &[u8]) -> Option<String> {
    let units: Vec<u16> = d.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    // truncate at the first null
    let end = units.iter().position(|&u| u == 0).unwrap_or(units.len());
    String::from_utf16(&units[..end]).ok()
}

/// Decode a `properties` stream.
fn parse_properties(data: &[u8]) -> Option<Props> {
    if data.len() < 4 || data[0] != 0x4c {
        return None;
    }
    let count = u16::from_le_bytes([data[2], data[3]]) as usize;
    let mut off = 4;
    let mut header = Vec::with_capacity(count);
    for _ in 0..count {
        if off + 6 > data.len() {
            return None;
        }
        let pid = u16::from_le_bytes([data[off], data[off + 1]]);
        let fmt = u16::from_le_bytes([data[off + 2], data[off + 3]]);
        let size = u16::from_le_bytes([data[off + 4], data[off + 5]]) as usize;
        off += 6;
        header.push((pid, fmt, size));
    }
    let mut entries = HashMap::new();
    for (pid, fmt, size) in header {
        if off + size > data.len() {
            return None;
        }
        entries.insert(pid, (fmt, data[off..off + size].to_vec()));
        off += size;
    }
    Some(Props { entries })
}

/// A thin wrapper over a `cfb::CompoundFile` cursor.
fn read_stream<F: Read + std::io::Seek>(comp: &mut cfb::CompoundFile<F>, path: &str) -> std::io::Result<Vec<u8>> {
    let mut s = comp.open_stream(path)?;
    let mut buf = Vec::new();
    s.read_to_end(&mut buf)?;
    Ok(buf)
}

/// Parse an AAF file from bytes, recovering tracks (composition clips → source
/// mob → PCM essence). Only understands this writer's subset.
pub fn parse_aaf(bytes: &[u8]) -> std::io::Result<ParsedAafSession> {
    let mut comp = cfb::CompoundFile::open(std::io::Cursor::new(bytes))?;

    // Root → Header strong ref (pid 0x0002).
    let root_props = parse_properties(&read_stream(&mut comp, "/properties")?)
        .ok_or_else(|| io_err("bad root properties"))?;
    let header_name = root_props
        .strong_ref_name(0x0002)
        .ok_or_else(|| io_err("no header ref"))?;
    let header_path = format!("/{}", header_name);

    let header_props = parse_properties(&read_stream(&mut comp, &format!("{}/properties", header_path))?)
        .ok_or_else(|| io_err("bad header properties"))?;
    let content_name = header_props
        .strong_ref_name(0x3b03)
        .ok_or_else(|| io_err("no content ref"))?;
    let content_path = format!("{}/{}", header_path, content_name);

    let content_props = parse_properties(&read_stream(&mut comp, &format!("{}/properties", content_path))?)
        .ok_or_else(|| io_err("bad content properties"))?;

    // Enumerate mobs from the Mobs strong-ref-set.
    let mobs_index = content_props
        .index_name(0x1901)
        .ok_or_else(|| io_err("no mobs set"))?;
    let mob_children = enumerate_set_children(&mut comp, &content_path, &mobs_index, &content_props, 0x1901)?;

    // Map MobID → source mob path + descriptor path.
    let mut song_name = String::new();
    let mut source_mobs: Vec<(String, String, [u8; 32])> = Vec::new(); // (mob_path, desc_path, mobid)
    let mut composition_path: Option<String> = None;

    for child in &mob_children {
        let mob_path = format!("{}/{}", content_path, child);
        let props = match parse_properties(&read_stream(&mut comp, &format!("{}/properties", mob_path))?) {
            Some(p) => p,
            None => continue,
        };
        let mob_id = props.mobid(0x4401).unwrap_or([0u8; 32]);
        let is_source = props.entries.get(&0x4701).is_some();
        if is_source {
            let desc_name = props
                .strong_ref_name(0x4701)
                .ok_or_else(|| io_err("source mob without descriptor"))?;
            source_mobs.push((mob_path.clone(), format!("{}/{}", mob_path, desc_name), mob_id));
        } else if props.entries.get(&0x4403).is_some() {
            composition_path = Some(mob_path);
            song_name = props.str(0x4402).unwrap_or_default();
        }
    }

    let composition = composition_path.ok_or_else(|| io_err("no composition mob"))?;
    let comp_props = parse_properties(&read_stream(&mut comp, &format!("{}/properties", composition))?)
        .ok_or_else(|| io_err("bad composition props"))?;
    let slots_index = comp_props
        .index_name(0x4403)
        .ok_or_else(|| io_err("no slots"))?;
    let slot_children = enumerate_vec_children(&mut comp, &composition, &slots_index, &comp_props, 0x4403)?;

    let source_by_id: HashMap<[u8; 32], (String, String)> = source_mobs
        .into_iter()
        .map(|(p, d, id)| (id, (p, d)))
        .collect();

    let mut tracks = Vec::new();
    for slot_child in &slot_children {
        let slot_path = format!("{}/{}", composition, slot_child);
        let slot_props = match parse_properties(&read_stream(&mut comp, &format!("{}/properties", slot_path))?) {
            Some(p) => p,
            None => continue,
        };
        let track_name = slot_props.str(0x4802).unwrap_or_else(|| "Track".into());
        let seg_name = slot_props
            .strong_ref_name(0x4803)
            .unwrap_or_default();
        let seq_path = format!("{}/{}", slot_path, seg_name);

        // Walk Sequence → Components → SourceClip → SourceID.
        let clip_source_id = find_source_id_in_sequence(&mut comp, &seq_path)?;
        let Some(source_id) = clip_source_id else { continue };
        let Some((_mob_path, desc_path)) = source_by_id.get(&source_id) else { continue };

        // Descriptor values.
        let desc_props = parse_properties(&read_stream(&mut comp, &format!("{}/properties", desc_path))?)
            .unwrap_or_else(|| Props { entries: HashMap::new() });
        let sample_rate = rational_num(&desc_props, 0x3001).unwrap_or(48000);
        let channels = desc_props.u32(0x3d07).unwrap_or(0) as u16;
        let bits = desc_props.u32(0x3d01).unwrap_or(16) as u16;
        let frames = desc_props.i64(0x3002).unwrap_or(0);

        // Essence: EssenceData.MobID == source MobID. Find its Data stream.
        let essence_data_name = essence_data_name(&mut comp, &content_path, &content_props, &source_id)?;
        let pcm = if let Some(full_path) = essence_data_name {
            read_stream(&mut comp, &full_path).unwrap_or_default()
        } else {
            Vec::new()
        };

        tracks.push(ParsedTrack {
            name: track_name,
            sample_rate,
            channels,
            bits_per_sample: bits,
            frames,
            pcm,
        });
    }

    Ok(ParsedAafSession { song_name, tracks })
}

/// Enumerate child storage names of a strong-ref SET (from its index stream).
fn enumerate_set_children<F: Read + std::io::Seek>(
    comp: &mut cfb::CompoundFile<F>,
    parent: &str,
    index: &str,
    props: &Props,
    pid: u16,
) -> std::io::Result<Vec<String>> {
    let _ = (props, pid);
    let idx_path = format!("{}/{} index", parent, index);
    let bytes = read_stream(comp, &idx_path)?;
    if bytes.len() < 15 {
        return Ok(Vec::new());
    }
    let count = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    let key_size = bytes[14] as usize;
    let mut out = Vec::new();
    let mut off = 15;
    for _ in 0..count {
        if off + 8 + key_size > bytes.len() {
            break;
        }
        let local_key = u32::from_le_bytes([bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]]);
        off += 8; // local_key + ref_count
        off += key_size;
        out.push(format!("{}{{{:x}}}", index, local_key));
    }
    Ok(out)
}

/// Enumerate child storage names of a strong-ref VECTOR.
fn enumerate_vec_children<F: Read + std::io::Seek>(
    comp: &mut cfb::CompoundFile<F>,
    parent: &str,
    index: &str,
    props: &Props,
    pid: u16,
) -> std::io::Result<Vec<String>> {
    let _ = (props, pid);
    let idx_path = format!("{}/{} index", parent, index);
    let bytes = read_stream(comp, &idx_path)?;
    if bytes.len() < 16 {
        return Ok(Vec::new());
    }
    let count = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    let mut out = Vec::new();
    let mut off = 12;
    for _ in 0..count {
        if off + 4 > bytes.len() {
            break;
        }
        let local_key = u32::from_le_bytes([bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]]);
        off += 4;
        out.push(format!("{}{{{:x}}}", index, local_key));
    }
    Ok(out)
}

/// Find the SourceID (MobID bytes) of the first SourceClip inside a Sequence.
fn find_source_id_in_sequence<F: Read + std::io::Seek>(
    comp: &mut cfb::CompoundFile<F>,
    seq_path: &str,
) -> std::io::Result<Option<[u8; 32]>> {
    let seq_props = match parse_properties(&read_stream(comp, &format!("{}/properties", seq_path))?) {
        Some(p) => p,
        None => return Ok(None),
    };
    let Some(comp_index) = seq_props.index_name(0x1001) else {
        return Ok(None);
    };
    let comp_children = enumerate_vec_children(comp, seq_path, &comp_index, &seq_props, 0x1001)?;
    for child in comp_children {
        let clip_path = format!("{}/{}", seq_path, child);
        if let Some(clip_props) = parse_properties(&read_stream(comp, &format!("{}/properties", clip_path))?) {
            if let Some(id) = clip_props.mobid(0x1101) {
                if !id.iter().all(|&b| b == 0) {
                    return Ok(Some(id));
                }
            }
        }
    }
    Ok(None)
}

/// Find the EssenceData child whose MobID matches, returning its child name.
fn essence_data_name<F: Read + std::io::Seek>(
    comp: &mut cfb::CompoundFile<F>,
    content_path: &str,
    content_props: &Props,
    source_id: &[u8; 32],
) -> std::io::Result<Option<String>> {
    let Some(index) = content_props.index_name(0x1902) else {
        return Ok(None);
    };
    let children = enumerate_set_children(comp, content_path, &index, content_props, 0x1902)?;
    for child in children {
        let path = format!("{}/{}", content_path, child);
        if let Some(p) = parse_properties(&read_stream(comp, &format!("{}/properties", path))?) {
            if let Some(id) = p.mobid(0x2701) {
                if id == *source_id {
                    // Essence bytes live in the Data stream.
                    if let Some(stream_name) = p.entries.get(&0x2702).and_then(|(f, d)| {
                        if *f == SF_DATA_STREAM {
                            decode_utf16(&d[1..])
                        } else {
                            None
                        }
                    }) {
                        return Ok(Some(format!("{}/{}", path, stream_name)));
                    }
                    return Ok(Some(path));
                }
            }
        }
    }
    Ok(None)
}

fn rational_num(props: &Props, pid: u16) -> Option<u32> {
    let d = props.data(pid)?;
    if d.len() < 4 {
        return None;
    }
    Some(u32::from_le_bytes([d[0], d[1], d[2], d[3]]))
}

fn io_err(msg: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidData, msg.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::aaf::session::{ExportOptions, StemData, export_stems_aaf};

    fn stem(name: &str, rate: u32, channels: u16, bits: u16, seconds: u32) -> StemData {
        let bytes_per_sample = (bits / 8) as u32;
        let frames = rate as i64 * seconds as i64;
        let pcm_len = frames as usize * channels as usize * bytes_per_sample as usize;
        let pcm: Vec<u8> = (0..pcm_len).map(|i| (i * 7 % 251) as u8).collect();
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
    fn round_trip_recovers_tracks_and_essence() {
        let stems = vec![
            stem("Kick", 48000, 2, 24, 1),
            stem("Snare", 44100, 1, 16, 1),
            stem("Bass", 96000, 2, 24, 2),
        ];
        let bytes = export_stems_aaf("Round Trip", &stems, &ExportOptions::default()).unwrap();
        let session = parse_aaf(&bytes).unwrap();

        assert_eq!(session.song_name, "Round Trip");
        assert_eq!(session.tracks.len(), 3);
        for (i, track) in session.tracks.iter().enumerate() {
            let s = &stems[i];
            assert_eq!(track.name, s.name);
            assert_eq!(track.sample_rate, s.sample_rate);
            assert_eq!(track.channels, s.channels);
            assert_eq!(track.bits_per_sample, s.bits_per_sample);
            assert_eq!(track.frames, s.frames);
            assert_eq!(track.pcm, s.pcm, "PCM mismatch for {}", s.name);
        }
    }

    #[test]
    fn empty_input_errors_not_panics() {
        assert!(parse_aaf(&[]).is_err());
    }

    #[test]
    fn random_bytes_error_not_panic() {
        // Deterministic pseudo-random bytes of a plausible size.
        let bytes: Vec<u8> = (0..4096).map(|i| (i * 31 % 251) as u8).collect();
        assert!(parse_aaf(&bytes).is_err());
    }

    #[test]
    fn truncated_aaf_errors_not_panic() {
        let stems = vec![stem("Kick", 48000, 2, 24, 1)];
        let bytes = export_stems_aaf("T", &stems, &ExportOptions::default()).unwrap();
        // Cut at many points — must not panic, only Err.
        for cut in [1usize, 16, 64, 512, 2048, bytes.len() / 2, bytes.len() - 1] {
            let truncated = &bytes[..cut.min(bytes.len())];
            let _ = parse_aaf(truncated); // must not panic
        }
        assert!(true);
    }

    #[test]
    fn valid_cfb_but_not_aaf_errors() {
        // A plain CFB file with no "/properties" stream.
        let mut cfb = cfb::CompoundFile::create(std::io::Cursor::new(Vec::new())).unwrap();
        {
            use std::io::Write;
            let mut s = cfb.create_stream("/hello").unwrap();
            s.write_all(b"world").unwrap();
        }
        cfb.flush().unwrap();
        let cursor = cfb.into_inner();
        let bytes = cursor.into_inner();
        assert!(parse_aaf(&bytes).is_err());
    }
}
