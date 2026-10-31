/**
 * Mobile UI Tree — NEW component tree on shared engine, NOT responsive tweak.
 * Key screens:
 * 1. Capture (foreground service indicator + waveform preview)
 * 2. Slice / Onset editor (trim, normalize, pitch, saturate)
 * 3. Genome / Variant swipe grid (8 children, tap/swipe/breed)
 * 4. Kit catalog (field kits with art seeded by place/time)
 * 5. Export round-robin group (N variants -> named group in manifest)
 *
 * Rules:
 * - All engine access through injected AudioContext + storage adapter.
 * - No direct React imports inside engine files (lint-guarded).
 */
