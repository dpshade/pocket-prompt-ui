/**
 * Sync Mode Types and Configuration
 * 
 * Defines the three distinct sync modes for Pocket Prompt:
 * 1. App-Only Mode: Data stored in Turso DB only
 * 2. Attached Directory Mode: MD files as source of truth, synced to Turso
 * 3. Cloud Sync Mode: Future multi-device sync (disabled for now)
 */

export type SyncMode = 'app-only' | 'attached-directory' | 'cloud-sync';

export interface SyncModeConfig {
  /** Display name for the mode */
  name: string;
  /** Description of what the mode does */
  description: string;
  /** Whether the mode is currently available */
  available: boolean;
  /** Icon component name */
  icon: 'database' | 'folder' | 'cloud';
  /** Whether this mode requires a directory to be selected */
  requiresDirectory: boolean;
  /** Primary storage location */
  primaryStorage: 'turso' | 'directory' | 'cloud';
  /** Whether data persists between sessions */
  persistsBetweenSessions: boolean;
  /** Whether data is synced to cloud */
  syncsToCloud: boolean;
}

export const SYNC_MODES: Record<SyncMode, SyncModeConfig> = {
  'app-only': {
    name: 'App Only',
    description: 'Data stored locally in the app. Works offline and persists between sessions.',
    available: true,
    icon: 'database',
    requiresDirectory: false,
    primaryStorage: 'turso',
    persistsBetweenSessions: true,
    syncsToCloud: false,
  },
  'attached-directory': {
    name: 'Attached Directory',
    description: 'Markdown files in a local folder are your source of truth. Changes sync to the app.',
    available: true,
    icon: 'folder',
    requiresDirectory: true,
    primaryStorage: 'directory',
    persistsBetweenSessions: true,
    syncsToCloud: false,
  },
  'cloud-sync': {
    name: 'Cloud Sync',
    description: 'Access your prompts from any device with automatic cloud backup and sync.',
    available: false,
    icon: 'cloud',
    requiresDirectory: false,
    primaryStorage: 'cloud',
    persistsBetweenSessions: true,
    syncsToCloud: true,
  },
};

// localStorage keys
export const SYNC_MODE_KEY = 'pocket_prompt_sync_mode';
export const ATTACHED_DIRECTORY_KEY = 'pocket_prompt_attached_directory';

/**
 * Get the current sync mode from localStorage
 * Defaults to 'app-only' if not set
 */
export function getCurrentSyncMode(): SyncMode {
  const stored = localStorage.getItem(SYNC_MODE_KEY);
  return (stored as SyncMode) || 'app-only';
}

/**
 * Save the current sync mode to localStorage
 */
export function setCurrentSyncMode(mode: SyncMode): void {
  localStorage.setItem(SYNC_MODE_KEY, mode);
}

/**
 * Get the attached directory path from localStorage
 */
export function getAttachedDirectory(): string | null {
  return localStorage.getItem(ATTACHED_DIRECTORY_KEY);
}

/**
 * Save the attached directory path to localStorage
 */
export function setAttachedDirectory(path: string | null): void {
  if (path) {
    localStorage.setItem(ATTACHED_DIRECTORY_KEY, path);
  } else {
    localStorage.removeItem(ATTACHED_DIRECTORY_KEY);
  }
}

/**
 * Check if a sync mode is valid and available
 */
export function isValidSyncMode(mode: string): mode is SyncMode {
  return mode in SYNC_MODES && SYNC_MODES[mode as SyncMode].available;
}

/**
 * Get the configuration for the current sync mode
 */
export function getCurrentSyncModeConfig(): SyncModeConfig {
  const mode = getCurrentSyncMode();
  return SYNC_MODES[mode];
}