/**
 * Device-based identity hook for Turso backend
 * Replaces useWallet for anonymous authentication
 */
import { create } from 'zustand';
import { getDeviceId, clearDeviceId, hasDeviceId } from '@/core/identity/device';
import { getOrCreateUser } from '@/backend/api/turso-queries';
import { isTursoConfigured } from '@/backend/api/turso';

interface IdentityState {
  userId: string | null;
  deviceId: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  clearIdentity: () => void;
}

export const useIdentity = create<IdentityState>((set, get) => ({
  userId: null,
  deviceId: null,
  connected: false,
  connecting: false,
  error: null,

  /**
   * Initialize identity on app load
   * Gets or creates device ID and syncs with Turso
   */
  initialize: async () => {
    const { connected, connecting } = get();

    // Don't re-initialize if already connected or in progress
    if (connected || connecting) return;

    set({ connecting: true, error: null });

    try {
      // Get or create device ID
      const deviceId = getDeviceId();

      // Check if Turso is configured
      if (!isTursoConfigured()) {
        // Local-only mode - just use device ID
        set({
          deviceId,
          userId: deviceId, // Use device ID as user ID in local mode
          connected: true,
          connecting: false,
        });
        return;
      }

      // Sync with Turso to get/create user
      const user = await getOrCreateUser(deviceId);

      set({
        userId: user.id,
        deviceId,
        connected: true,
        connecting: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize identity';
      console.error('Identity initialization error:', error);

      // Fall back to local-only mode on error
      const deviceId = hasDeviceId() ? getDeviceId() : null;
      set({
        error: errorMessage,
        connecting: false,
        connected: !!deviceId,
        deviceId,
        userId: deviceId,
      });
    }
  },

  /**
   * Clear identity and reset state
   */
  clearIdentity: () => {
    clearDeviceId();
    set({
      userId: null,
      deviceId: null,
      connected: false,
      connecting: false,
      error: null,
    });
  },
}));

/**
 * Helper to get user ID synchronously (for components that need it immediately)
 * Returns device ID as fallback
 */
export function getUserId(): string | null {
  const state = useIdentity.getState();
  return state.userId || state.deviceId;
}
