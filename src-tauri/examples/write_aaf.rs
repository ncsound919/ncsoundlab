//! Throws several stem-export AAF variants to disk for external validation
//! (pyaaf2). `cargo run --example write_aaf -- <outdir>`.
use app_lib::aaf::session::{export_stems_aaf, ExportOptions, StemData};
use std::path::PathBuf;

fn pcm(frames: i64, channels: u16, bits: u16, seed: u64) -> Vec<u8> {
    let bytes_per_sample = (bits / 8) as usize;
    let len = frames as usize * channels as usize * bytes_per_sample;
    let mut x = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    (0..len)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            (x % 251) as u8
        })
        .collect()
}

fn stem(name: &str, rate: u32, channels: u16, bits: u16, frames: i64, seed: u64) -> StemData {
    StemData {
        name: name.into(),
        sample_rate: rate,
        channels,
        bits_per_sample: bits,
        frames,
        pcm: pcm(frames, channels, bits, seed),
    }
}

fn main() {
    let outdir: PathBuf = std::env::args().nth(1).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    std::fs::create_dir_all(&outdir).unwrap();
    let opts = ExportOptions::default();

    let variants: Vec<(&str, &str, Vec<StemData>)> = vec![
        (
            "basic",
            "Basic Song",
            vec![
                stem("Kick", 48000, 2, 24, 48000, 1),
                stem("Snare", 48000, 1, 16, 48000, 2),
            ],
        ),
        (
            "mixed",
            "Mixed Formats",
            vec![
                stem("Pad96", 96000, 2, 24, 96000, 3),
                stem("Vox44", 44100, 1, 16, 44100, 4),
                stem("Bass48", 48000, 2, 16, 48000 * 2, 5),
            ],
        ),
        ("single", "One Stem", vec![stem("Only", 48000, 2, 24, 48000 * 4, 6)]),
        ("empty", "No Stems", vec![]),
        (
            "many",
            "Big Session",
            (0..8)
                .map(|i| stem(&format!("Track{}", i + 1), 48000, 2, 24, 48000 * 2, 10 + i))
                .collect(),
        ),
        (
            "dupe",
            "Duplicate Names",
            vec![
                stem("Kick", 48000, 2, 24, 48000, 100),
                stem("Kick", 48000, 2, 24, 48000, 200),
            ],
        ),
        (
            "silence",
            "Silence & Hot",
            vec![
                StemData {
                    name: "Silence".into(),
                    sample_rate: 48000,
                    channels: 2,
                    bits_per_sample: 24,
                    frames: 48000,
                    pcm: vec![0u8; 48000 * 2 * 3],
                },
                stem("Hot", 48000, 1, 16, 48000, 7),
            ],
        ),
    ];

    for (name, song, stems) in &variants {
        let bytes = export_stems_aaf(song, stems, &opts).unwrap();
        let path = outdir.join(format!("{}.aaf", name));
        std::fs::write(&path, &bytes).unwrap();
        println!("wrote {:>10} bytes  {}.aaf  ({} stems)", bytes.len(), name, stems.len());
    }
}
