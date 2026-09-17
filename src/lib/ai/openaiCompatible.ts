/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * OpenAI-compatible chat-completions client (Phase 3.1).
 *
 * One implementation covers every OpenAI-compatible endpoint:
 * OpenAI, OpenRouter, Groq, llama.cpp's server, and Ollama — which exposes
 * `/v1/chat/completions` at `http://localhost:11434/v1`.
 *
 * Requests go through an injected transport (Rust-backed on desktop), so this
 * module needs no CORS headers from the provider and no CSP entry.
 */

import { LlmUnavailableError, type ChatMessage, type CompletionOptions, type CompletionResult, type LlmProvider } from './provider';
import { DEFAULT_TIMEOUT_MS, type HttpTransport } from './transport';

export interface OpenAiCompatibleConfig {
  /** Base URL *without* the trailing `/chat/completions`, e.g. https://api.openai.com/v1 */
  baseUrl: string;
  model: string;
}

/** Local Ollama, exposed through its OpenAI-compatible shim. */
export const OLLAMA_BASE_URL = 'http://localhost:11434/v1';

export interface OpenAiCompatibleOptions {
  transport: HttpTransport;
  config: OpenAiCompatibleConfig;
  /** Resolve the API key at call time. Returns null for keyless local servers. */
  getApiKey?: () => Promise<string | null>;
}

/** Join the base URL and path without doubling or dropping a slash. */
export function completionsUrl(baseUrl: string): string {
  return `${(baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
}

/** Narrow an unknown chat-completions body to text + usage. Exported for testing. */
export function readCompletion(body: string): { text: string; usage?: CompletionResult['usage'] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new LlmUnavailableError('Provider returned a non-JSON response');
  }
  const choice = (parsed as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0];
  const text = choice?.message?.content;
  if (typeof text !== 'string') {
    throw new LlmUnavailableError('Provider response did not contain a completion');
  }
  const rawUsage = (parsed as {
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  })?.usage;
  const usage = rawUsage
    ? {
        promptTokens: rawUsage.prompt_tokens,
        completionTokens: rawUsage.completion_tokens,
        totalTokens: rawUsage.total_tokens,
      }
    : undefined;
  return { text, usage };
}

export function createOpenAiCompatibleProvider(opts: OpenAiCompatibleOptions): LlmProvider {
  const { transport, config } = opts;
  const configured = Boolean(config.baseUrl && config.model);

  return {
    id: 'openai-compatible',
    label: config.model || 'OpenAI-compatible',
    available: configured,
    async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<CompletionResult> {
      if (!configured) {
        throw new LlmUnavailableError('No model or base URL configured');
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = opts.getApiKey ? await opts.getApiKey() : null;
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const payload = JSON.stringify({
        model: config.model,
        messages,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      });

      const res = await transport.request(completionsUrl(config.baseUrl), {
        method: 'POST',
        headers,
        body: payload,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });

      if (res.status === 401 || res.status === 403) {
        throw new LlmUnavailableError('Provider rejected the API key (401/403)');
      }
      if (!res.ok) {
        throw new LlmUnavailableError(`Provider request failed with HTTP ${res.status}`);
      }

      const { text, usage } = readCompletion(res.body);
      return { text, model: config.model, usage };
    },
  };
}
