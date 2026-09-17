/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AiSettingsPanel } from './AiSettingsPanel';
import { useAiProviderStore } from '../store/aiProviderStore';
import { clearSessionSecrets, hasSessionSecret } from '../lib/ai/secrets';
import type { HttpTransport, HttpResponse } from '../lib/ai/transport';

const transport = (res: Partial<HttpResponse>): HttpTransport => ({
  id: 'fake',
  rustBacked: true,
  request: vi.fn(async () => ({ status: 200, ok: true, body: '[]', ...res }) as HttpResponse),
});

const renderPanel = (t?: HttpTransport, onToast = vi.fn()) =>
  render(<AiSettingsPanel isOpen onClose={vi.fn()} onToast={onToast} transport={t} />);

beforeEach(() => {
  localStorage.clear();
  clearSessionSecrets();
  useAiProviderStore.getState().reset();
});

describe('AiSettingsPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AiSettingsPanel isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog with AI disabled by default', () => {
    renderPanel();
    expect(screen.getByRole('dialog', { name: 'AI provider settings' })).toBeDefined();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('persists the enable toggle', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(useAiProviderStore.getState().enabled).toBe(true);
    expect(JSON.parse(localStorage.getItem('ncs-ai-provider-v1') as string).enabled).toBe(true);
  });

  it('holds a manually entered key in session memory only', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-abc' } });
    fireEvent.click(screen.getByRole('button', { name: /^Hold$/ }));
    expect(hasSessionSecret('SOUNDLAB_LLM_API_KEY')).toBe(true);
    expect(screen.getByText(/held for this session/i)).toBeDefined();
    // Nothing secret reached disk.
    expect(localStorage.getItem('ncs-ai-provider-v1') ?? '').not.toContain('sk-abc');
  });

  it('reports a successful Keywire read without displaying the value', async () => {
    const t = transport({ body: JSON.stringify([{ key: 'SOUNDLAB_LLM_API_KEY', value: 'sk-vault-secret' }]) });
    renderPanel(t);
    fireEvent.change(screen.getByLabelText('Secret source'), { target: { value: 'keywire' } });
    fireEvent.change(screen.getByLabelText('Keywire service token'), { target: { value: 'tok' } });
    fireEvent.click(screen.getByRole('button', { name: /^Test$/ }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Secret found/));
    expect(screen.queryByText(/sk-vault-secret/)).toBeNull();
  });

  it('surfaces a Keywire auth failure', async () => {
    const t = transport({ status: 401, ok: false });
    renderPanel(t);
    fireEvent.change(screen.getByLabelText('Secret source'), { target: { value: 'keywire' } });
    fireEvent.change(screen.getByLabelText('Keywire service token'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /^Test$/ }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/rejected the service token/));
  });

  it('warns that Keywire reads need the desktop build when not in Tauri', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Secret source'), { target: { value: 'keywire' } });
    expect(screen.getByText(/require the desktop build/i)).toBeDefined();
  });

  it('tests the model endpoint and reports the status code on failure', async () => {
    const ok = transport({ body: JSON.stringify({ choices: [{ message: { content: 'pong' } }] }) });
    const { unmount } = renderPanel(ok);
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'test-model' } });
    fireEvent.click(screen.getByRole('button', { name: /Test model/ }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Model responded/));
    unmount();

    renderPanel(transport({ status: 503, ok: false }));
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'test-model' } });
    fireEvent.click(screen.getByRole('button', { name: /Test model/ }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/HTTP 503/));
  });

  it('disables the model test until a URL and model are set', () => {
    renderPanel();
    expect((screen.getByRole('button', { name: /Test model/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('clears session secrets on demand', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-abc' } });
    fireEvent.click(screen.getByRole('button', { name: /^Hold$/ }));
    expect(hasSessionSecret('SOUNDLAB_LLM_API_KEY')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Clear session secrets/ }));
    expect(hasSessionSecret('SOUNDLAB_LLM_API_KEY')).toBe(false);
    expect(screen.getByRole('status').textContent).toMatch(/cleared/);
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<AiSettingsPanel isOpen onClose={onClose} />);
    fireEvent.click(container.querySelector('.absolute.inset-0') as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
