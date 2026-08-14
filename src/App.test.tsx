import { render, screen, fireEvent } from '@testing-library/react';
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

  it('gates a fresh visitor behind the welcome dialog and starts the demo', () => {
    render(<App />);
    expect(screen.getByRole('dialog', { name: 'Welcome to NC Sound Lab' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Start my 20-minute demo/i }));
    expect(localStorage.getItem('ncs_demo_status')).toBe('active');
    expect(screen.getByRole('button', { name: /Demo/i })).toBeDefined();
  });

  it('shows the paywall once the demo session expires', () => {
    localStorage.setItem('ncs_demo_status', 'expired');
    render(<App />);
    expect(screen.getByRole('dialog', { name: 'Free demo session ended' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Already purchased/i }));
    expect(localStorage.getItem('ncs_demo_status')).toBe('purchased');
  });

  it('locks immediately when a previously started demo has already elapsed', () => {
    localStorage.setItem('ncs_demo_status', 'active');
    localStorage.setItem('ncs_demo_start', String(Date.now() - 21 * 60 * 1000));
    render(<App />);
    expect(screen.getByRole('dialog', { name: 'Free demo session ended' })).toBeDefined();
  });

  it('does not show a gate for a purchaser', () => {
    localStorage.setItem('ncs_demo_status', 'purchased');
    render(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
