/**
 * Feature flags for validation launch
 * These control which features are visible/enabled
 */

// Check if running in Tauri desktop environment
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export const FEATURE_FLAGS = {
  /** Enable Arweave storage and wallet UI */
  ARWEAVE_ENABLED: false,

  /** Enable Turso backend (local SQLite in Tauri, cloud in web) */
  TURSO_ENABLED: true,

  /** Enable client-side encryption */
  ENCRYPTION_ENABLED: false,

  /** Show wallet connection UI */
  WALLET_CONNECTION: false,

  /** Show "Sync to Cloud" mockup button (for validation in desktop app) */
  SHOW_SYNC_BUTTON: isTauri,

  /** Running as desktop app */
  IS_DESKTOP: isTauri,
} as const;

export type FeatureFlags = typeof FEATURE_FLAGS;
