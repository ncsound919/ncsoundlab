//! AAF export/import for the desktop build (Phase 4.5).
//!
//! Emits a real SMPTE ST 377-1 AAF file (OLE Compound File Binary) that Pro
//! Tools can import, with one audio track per stem (embedded PCM essence).
//! This is a Rust port of pyaaf2's writing model built on the `cfb` crate.

pub mod commands;
pub mod dict;
pub mod reader;
pub mod session;
pub mod types;
pub mod writer;
