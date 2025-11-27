/**
 * Sync Mode Management Hook
 * 
 * Provides explicit control over sync modes with proper validation
 * and state management. Replaces implicit localStorage detection.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SyncMode } from '@/shared/types/sync';
import {
  SYNC_MODES,
  setCurrentSyncMode,
  setAttachedDirectory
} from '@/shared/types/sync';
import * as directoryStorage from '@/backend/api/directory-storage';

interface SyncModeState {
  /** Current sync mode */
  currentMode: SyncMode;
  /** Attached directory path (null if not attached) */
  attachedDirectory: string | null;
  /** Whether we're currently switching modes */
  isSwitching: boolean;
  /** Any error that occurred during mode switching */
  error: string | null;
  
  /** Actions */
  switchMode: (mode: SyncMode, directoryPath?: string) => Promise<boolean>;
  attachDirectory: () => Promise<boolean>;
  detachDirectory: () => void;
  clearError: () => void;
  validateCurrentMode: () => Promise<boolean>;
}

export const useSyncMode = create<SyncModeState>()(
  persist(
    (set, get) => ({
      // Default state - zustand persist will hydrate from storage
      currentMode: 'app-only' as SyncMode,
      attachedDirectory: null,
      isSwitching: false,
      error: null,

      switchMode: async (mode: SyncMode, directoryPath?: string) => {
        
        // Validate mode is available
        if (!SYNC_MODES[mode].available) {
          set({ error: `Sync mode '${SYNC_MODES[mode].name}' is not available yet` });
          return false;
        }

        // For attached-directory mode, require directory path
        if (mode === 'attached-directory' && !directoryPath && !get().attachedDirectory) {
          set({ error: 'Directory path is required for attached directory mode' });
          return false;
        }

        set({ isSwitching: true, error: null });

        try {
          // If switching to attached-directory mode, validate directory
          if (mode === 'attached-directory') {
            const pathToUse = directoryPath || get().attachedDirectory;
            if (!pathToUse) {
              throw new Error('No directory path provided');
            }

            // Validate directory exists and is readable
            try {
              await directoryStorage.readPromptsFromDirectory(pathToUse);
            } catch (dirError) {
              throw new Error(`Cannot access directory: ${dirError instanceof Error ? dirError.message : 'Unknown error'}`);
            }

            setAttachedDirectory(pathToUse);
            set({ attachedDirectory: pathToUse });
          }

          // If switching away from attached-directory, clear directory
          if (get().currentMode === 'attached-directory' && mode !== 'attached-directory') {
            setAttachedDirectory(null);
            set({ attachedDirectory: null });
            directoryStorage.stopWatching();
          }

          // Save the new mode
          setCurrentSyncMode(mode);
          set({ currentMode: mode, isSwitching: false });
          
          return true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to switch sync mode';
          set({ error: errorMessage, isSwitching: false });
          return false;
        }
      },

      attachDirectory: async () => {
        set({ isSwitching: true, error: null });

        try {
          const path = await directoryStorage.selectDirectory();
          if (!path) {
            set({ isSwitching: false });
            return false; // User cancelled
          }

          // Validate directory
          try {
            await directoryStorage.readPromptsFromDirectory(path);
          } catch (dirError) {
            throw new Error(`Cannot access directory: ${dirError instanceof Error ? dirError.message : 'Unknown error'}`);
          }

          // Switch to attached-directory mode
          const success = await get().switchMode('attached-directory', path);
          if (success) {
            set({ attachedDirectory: path });
          }

          return success;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to attach directory';
          set({ error: errorMessage, isSwitching: false });
          return false;
        }
      },

      detachDirectory: () => {
        // Stop watching
        directoryStorage.stopWatching();
        
        // Clear directory and switch to app-only mode
        setAttachedDirectory(null);
        setCurrentSyncMode('app-only');
        set({ 
          attachedDirectory: null, 
          currentMode: 'app-only',
          error: null 
        });
      },

      clearError: () => {
        set({ error: null });
      },

      validateCurrentMode: async () => {
        try {
          if (get().currentMode === 'attached-directory') {
            if (!get().attachedDirectory) {
              set({ error: 'Attached directory mode selected but no directory configured' });
              return false;
            }

            // Validate directory is still accessible - CRITICAL for startup
            try {
              console.log('[SyncMode] Validating directory access on startup:', get().attachedDirectory);
              await directoryStorage.readPromptsFromDirectory(get().attachedDirectory!);
              console.log('[SyncMode] Directory validation successful');
            } catch (dirError) {
              const errorMsg = `Attached directory is no longer accessible: ${dirError instanceof Error ? dirError.message : 'Unknown error'}`;
              console.error('[SyncMode] Directory validation failed:', errorMsg);
              set({ error: errorMsg });
              return false;
            }
          }

          set({ error: null });
          return true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Validation failed';
          set({ error: errorMessage });
          return false;
        }
      },
    }),
    {
      name: 'sync-mode-storage',
      partialize: (state) => ({
        currentMode: state.currentMode,
        attachedDirectory: state.attachedDirectory,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          console.log('[SyncMode] Hydrated from storage:', {
            currentMode: state.currentMode,
            attachedDirectory: state.attachedDirectory,
          });
        }
      },
    }
  )
);

/**
 * Wait for sync mode store to hydrate from storage
 */
export async function waitForSyncModeHydration(): Promise<void> {
  // zustand-persist hydrates synchronously from localStorage
  // but we add a small delay to ensure React has re-rendered
  await new Promise(resolve => setTimeout(resolve, 10));
}

/**
 * Hook to get current sync mode configuration
 */
export function useCurrentSyncModeConfig() {
  const currentMode = useSyncMode((state) => state.currentMode);
  return SYNC_MODES[currentMode];
}

/**
 * Hook to check if current mode is attached directory
 */
export function useIsAttachedDirectoryMode() {
  const currentMode = useSyncMode((state) => state.currentMode);
  const attachedDirectory = useSyncMode((state) => state.attachedDirectory);
  return currentMode === 'attached-directory' && attachedDirectory !== null;
}

/**
 * Validate directory accessibility on startup - critical for attached directory mode
 */
export async function validateDirectoryOnStartup(): Promise<boolean> {
  const state = useSyncMode.getState();
  
  if (state.currentMode === 'attached-directory' && state.attachedDirectory) {
    try {
      console.log('[SyncMode] Startup validation - checking directory access:', state.attachedDirectory);
      await directoryStorage.readPromptsFromDirectory(state.attachedDirectory);
      console.log('[SyncMode] Startup validation successful - directory is accessible');
      return true;
    } catch (error) {
      const errorMsg = `Directory is not accessible on startup: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('[SyncMode] Startup validation failed:', errorMsg);
      useSyncMode.setState({ error: errorMsg });
      return false;
    }
  }
  
  return true; // No validation needed for other modes
}

/**
 * Hook to get sync mode status for UI display
 */
export function useSyncModeStatus() {
  const currentMode = useSyncMode((state) => state.currentMode);
  const attachedDirectory = useSyncMode((state) => state.attachedDirectory);
  const isSwitching = useSyncMode((state) => state.isSwitching);
  const error = useSyncMode((state) => state.error);
  const config = SYNC_MODES[currentMode];

  return {
    mode: currentMode,
    config,
    attachedDirectory,
    isSwitching,
    error,
    isAvailable: config.available,
    requiresDirectory: config.requiresDirectory,
    hasDirectory: attachedDirectory !== null,
    isValid: !config.requiresDirectory || (config.requiresDirectory && attachedDirectory !== null),
  };
}