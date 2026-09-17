/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  OLLAMA_BASE_URL,
  completionsUrl,
  createOpenAiCompatibleProvider,
  readCompletion,
} from './openaiCompatible';
import { LlmUnavailableError, createNullProvider } from './provider';
import type { HttpTransport, HttpResponse } from './transport';

const transportReturning = (res: Partial<HttpResponse>): HttpTransport => ({
  id: 'fake',
  rustBacked: true,
  request: vi.fn(async () => ({ status: 200, ok: true, body: '{}', ...res }) as HttpResponse),
});

const chatBody = (content: string, usage?: Record<string, number>) =>
  JSON.stringify({ choices: [{ message: { content } }], ...(usage ? { usage } : {}) });

describe('completionsUrl', () => {
  it('appends the path without doubling or dropping a slash', () => {
    expect(completionsUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/chat/completions');
    expect(completionsUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions');
    expect(completionsUrl('')).toBe('/chat/completions');
  });

  it('defaults to the local Ollama shim', () => {
    expect(OLLAMA_BASE_URL).toBe('http://localhost:11434/v1');
  });
});

describe('readCompletion', () => {
  it('extracts text and usage', () => {
    const res = readCompletion(chatBody('hi', { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 }));
    expect(res.text).toBe('hi');
    expect(res.usage).toEqual({ promptTokens: 3, completionTokens: 4, totalTokens: 7 });
  });

  it('omits usage when absent', () => {
    expect(readCompletion(chatBody('hi')).usage).toBeUndefined();
  });

  it('throws on non-JSON and on a body without a completion', () => {
    expect(() => readCompletion('<html>')).toThrow(LlmUnavailableError);
    expect(() => readCompletion(JSON.stringify({ choices: [] }))).toThrow(/did not contain a completion/);
  });
});

describe('createOpenAiCompatibleProvider', () => {
  const base = { baseUrl: 'https://api.example.com/v1', model: 'test-model' };

  it('reports unavailable and refuses to complete when unconfigured', async () => {
    const p = createOpenAiCompatibleProvider({ transport: transportReturning({}), config: { baseUrl: '', model: '' } });
    expect(p.available).toBe(false);
    await expect(p.complete([{ role: 'user', content: 'x' }])).rejects.toThrow(/No model or base URL/);
  });

  it('posts the transcript and returns the completion', async () => {
    const transport = transportReturning({ body: chatBody('hello', { total_tokens: 5 }) });
    const p = createOpenAiCompatibleProvider({ transport, config: base, getApiKey: async () => 'sk-1' });
    expect(p.available).toBe(true);
    const out = await p.complete([{ role: 'user', content: 'hi' }]);
    expect(out.text).toBe('hello');
    expect(out.model).toBe('test-model');
    expect(out.usage?.totalTokens).toBe(5);

    const init = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-1');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'test-model', messages: [{ role: 'user', content: 'hi' }] });
  });

  it('omits the Authorization header for keyless local servers', async () => {
    const transport = transportReturning({ body: chatBody('ok') });
    const p = createOpenAiCompatibleProvider({ transport, config: { ...base, baseUrl: OLLAMA_BASE_URL } });
    await p.complete([{ role: 'user', content: 'hi' }]);
    const init = (transport.request as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('passes temperature and max tokens only when provided', async () => {
    const transport = transportReturning({ body: chatBody('ok') });
    const p = createOpenAiCompatibleProvider({ transport, config: base });
    await p.complete([{ role: 'user', content: 'hi' }]);
    const bare = JSON.parse((transport.request as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(bare).not.toHaveProperty('temperature');
    expect(bare).not.toHaveProperty('max_tokens');

    await p.complete([{ role: 'user', content: 'hi' }], { temperature: 0.2, maxTokens: 64 });
    const tuned = JSON.parse((transport.request as ReturnType<typeof vi.fn>).mock.calls[1][1].body);
    expect(tuned).toMatchObject({ temperature: 0.2, max_tokens: 64 });
  });

  it('maps auth and server errors to typed failures', async () => {
    const p401 = createOpenAiCompatibleProvider({ transport: transportReturning({ status: 401, ok: false }), config: base });
    await expect(p401.complete([{ role: 'user', content: 'x' }])).rejects.toThrow(/rejected the API key/);
    const p500 = createOpenAiCompatibleProvider({ transport: transportReturning({ status: 500, ok: false }), config: base });
    await expect(p500.complete([{ role: 'user', content: 'x' }])).rejects.toThrow(/HTTP 500/);
  });
});

describe('createNullProvider', () => {
  it('is unavailable and never fabricates output', async () => {
    const p = createNullProvider('nothing configured');
    expect(p.available).toBe(false);
    await expect(p.complete([{ role: 'user', content: 'x' }])).rejects.toThrow(/nothing configured/);
  });
});
