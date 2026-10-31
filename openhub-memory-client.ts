/**
 * memoryClient.ts — OpenHub integration with agent-support-platform MemoryHttpServer
 *
 * The Android app exposes Letta memory blocks on http://127.0.0.1:8765.
 * This module queries that endpoint and injects relevant memory context into
 * every outgoing OpenCode/LLM prompt, giving the agent persistent long-term memory.
 */

const MEMORY_BASE = "http://127.0.0.1:8765/api/memory";

export interface MemoryBlock {
  blockId: string;
  blockName: string;
  blockType: string;
  content: string;
  version: number;
  isLocked: boolean;
  lastDriftScore: number;
}

export interface VectorResult {
  sourceId: string;
  snippet: string;
  similarityScore: number;
}

/** Fetches all Letta memory blocks. Returns [] if the app is not running. */
export async function fetchAllBlocks(): Promise<MemoryBlock[]> {
  try {
    const res = await fetch(`${MEMORY_BASE}/blocks`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    return (await res.json()) as MemoryBlock[];
  } catch {
    return [];
  }
}

/** Vector similarity search against indexed snippets. */
export async function searchMemory(query: string, topK = 3): Promise<VectorResult[]> {
  try {
    const res = await fetch(`${MEMORY_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, topK }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    return (await res.json()) as VectorResult[];
  } catch {
    return [];
  }
}

/**
 * Builds a memory context string to prepend to any LLM system prompt.
 * Format mirrors the Letta/MemGPT memory block injection convention.
 *
 * @param userQuery  The user's current message/task (used for vector search).
 * @returns          A ready-to-inject string, or "" if memory is unavailable.
 */
export async function buildMemoryContext(userQuery: string): Promise<string> {
  const [blocks, searchResults] = await Promise.all([
    fetchAllBlocks(),
    searchMemory(userQuery, 3),
  ]);

  if (blocks.length === 0 && searchResults.length === 0) return "";

  const lines: string[] = ["<!-- PERSISTENT MEMORY CONTEXT (agent-support-platform) -->"];

  // Core Letta memory blocks
  if (blocks.length > 0) {
    lines.push("\n## Memory Blocks");
    for (const b of blocks) {
      lines.push(`### [${b.blockType}] ${b.blockName} (v${b.version})`);
      lines.push(b.content);
    }
  }

  // Relevant retrieved snippets
  if (searchResults.length > 0) {
    lines.push("\n## Retrieved Context (vector search)");
    for (const r of searchResults) {
      lines.push(
        `- [score: ${r.similarityScore.toFixed(3)}] ${r.snippet}`
      );
    }
  }

  lines.push("<!-- END MEMORY CONTEXT -->\n");
  return lines.join("\n");
}

/** Update a memory block from OpenHub (user operator write). */
export async function updateMemoryBlock(
  blockId: string,
  content: string,
  reason = "OpenHub user update"
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${MEMORY_BASE}/blocks/${blockId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, reason }),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    return { success: json.success ?? false, message: json.message ?? "Unknown" };
  } catch (e: any) {
    return { success: false, message: e.message ?? "Network error" };
  }
}
