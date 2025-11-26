/**
 * Feature flags for validation launch
 * These control which features are visible/enabled
 */
export const FEATURE_FLAGS = {
  /** Enable Arweave storage and wallet UI */
  ARWEAVE_ENABLED: false,

  /** Enable Turso backend */
  TURSO_ENABLED: true,

  /** Enable client-side encryption */
  ENCRYPTION_ENABLED: false,

  /** Show wallet connection UI */
  WALLET_CONNECTION: false,
} as const;

export type FeatureFlags = typeof FEATURE_FLAGS;
