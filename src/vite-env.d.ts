/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PURCHASE_URL?: string;
  readonly VITE_DOWNLOAD_URL?: string;
  readonly VITE_EMAIL_CAPTURE_URL?: string;
  readonly VITE_ALBUM_1_URL?: string;
  readonly VITE_ALBUM_2_URL?: string;
  /** Set to "1" on a local dev server to disable the demo gate (hardware testing). */
  readonly VITE_DISABLE_DEMO_GATE?: string;
}
