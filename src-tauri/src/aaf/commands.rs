//! Tauri commands for AAF export/import (Phase 4.5).

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};

use crate::aaf::reader::{ParsedAafSession, ParsedTrack, parse_aaf};
use crate::aaf::session::{ExportOptions, StemData, export_stems_aaf};

#[derive(Debug, Deserialize)]
pub struct AafStemPayload {
    pub name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub frames: i64,
    pub pcm_base64: String,
}

#[derive(Debug, Deserialize)]
pub struct AafExportPayload {
    pub song_name: String,
    pub stems: Vec<AafStemPayload>,
    pub output_path: String,
}

#[derive(Debug, Serialize)]
pub struct AafExportResult {
    pub path: String,
    pub bytes: usize,
    pub tracks: usize,
}

/// Render the stems to a real AAF file at `output_path`.
#[tauri::command]
pub fn export_aaf_session(payload: AafExportPayload) -> Result<AafExportResult, String> {
    let mut stems = Vec::with_capacity(payload.stems.len());
    for s in payload.stems {
        let pcm = BASE64
            .decode(s.pcm_base64.trim())
            .map_err(|e| format!("bad pcm base64: {}", e))?;
        stems.push(StemData {
            name: s.name,
            sample_rate: s.sample_rate,
            channels: s.channels,
            bits_per_sample: s.bits_per_sample,
            frames: s.frames,
            pcm,
        });
    }
    let bytes = export_stems_aaf(&payload.song_name, &stems, &ExportOptions::default())
        .map_err(|e| format!("aaf export failed: {}", e))?;
    std::fs::write(&payload.output_path, &bytes)
        .map_err(|e| format!("failed to write {}: {}", payload.output_path, e))?;
    Ok(AafExportResult {
        path: payload.output_path,
        bytes: bytes.len(),
        tracks: stems.len(),
    })
}

#[derive(Debug, Serialize)]
pub struct AafTrackPayload {
    pub name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub frames: i64,
    pub pcm_base64: String,
}

impl From<ParsedTrack> for AafTrackPayload {
    fn from(t: ParsedTrack) -> Self {
        AafTrackPayload {
            name: t.name,
            sample_rate: t.sample_rate,
            channels: t.channels,
            bits_per_sample: t.bits_per_sample,
            frames: t.frames,
            pcm_base64: BASE64.encode(t.pcm),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AafImportResult {
    pub song_name: String,
    pub tracks: Vec<AafTrackPayload>,
}

/// Import an AAF: recover session tracks (composition clips → PCM essence).
#[tauri::command]
pub fn import_aaf_session(path: String) -> Result<AafImportResult, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("cannot read {}: {}", path, e))?;
    let session: ParsedAafSession = parse_aaf(&bytes).map_err(|e| format!("aaf parse failed: {}", e))?;
    Ok(AafImportResult {
        song_name: session.song_name,
        tracks: session.tracks.into_iter().map(Into::into).collect(),
    })
}
