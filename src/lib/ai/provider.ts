/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LLM provider interface (Phase 3.1).
 *
 * A provider is intentionally minimal: take a chat transcript, return text plus
 * token usage. Structured output, validation and prompting live above this
 * layer (the natural-language command interpreter), so swapping providers never
 * changes command semantics.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage?: TokenUsage;
}

export interface LlmProvider {
  readonly id: string;
  readonly label: string;
  /** True when a completion can actually be attempted right now. */
  readonly available: boolean;
  complete(messages: ChatMessage[], opts?: CompletionOptions): Promise<CompletionResult>;
}

/** Raised when a provider is configured but cannot be used (no key, offline). */
export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

/** A provider used when AI is disabled or unconfigured. Never fabricates text. */
export function createNullProvider(reason = 'AI is not configured'): LlmProvider {
  return {
    id: 'null',
    label: 'Disabled',
    available: false,
    async complete() {
      throw new LlmUnavailableError(reason);
    },
  };
}
