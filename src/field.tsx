import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import FieldStudio from './components/field/FieldStudio';
import './index.css';

/**
 * Phone entry (`field.html`).
 *
 * This file imports the field studio and nothing from the workstation. That is
 * the whole point of the separate HTML entry: opening the phone app can never
 * pull `App.tsx`, Tone, the MIDI service or the desktop panels into the page.
 */
document.title = 'NC Field — capture, slice, evolve, kit';

if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FieldStudio />
  </StrictMode>,
);
