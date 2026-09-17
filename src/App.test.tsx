import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import React from 'react';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the main dashboard', () => {
    // Note: App might be large, but we check for the main brand title
    render(<App />);
    expect(screen.getByText(/SONIK\s+STUDIO/i)).toBeDefined();
  });

  it('shows no gate — the app is free and ungated', () => {
    render(<App />);
    expect(screen.queryByRole('dialog', { name: /Welcome to NC Sound Lab/i })).toBeNull();
    expect(screen.queryByRole('dialog', { name: /Free demo session ended/i })).toBeNull();
  });
});
