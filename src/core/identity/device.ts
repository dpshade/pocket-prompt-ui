/**
 * Device-based anonymous identity
 * Generates and persists a UUID per browser for Turso user identification
 */

const DEVICE_ID_KEY = 'pktpmt_device_id';

/**
 * Get or create device ID
 * Creates a new UUID if one doesn't exist
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Check if device ID exists
 */
export function hasDeviceId(): boolean {
  return localStorage.getItem(DEVICE_ID_KEY) !== null;
}

/**
 * Clear device ID (for logout/reset)
 */
export function clearDeviceId(): void {
  localStorage.removeItem(DEVICE_ID_KEY);
}

/**
 * Get device ID without creating one
 * Returns null if no device ID exists
 */
export function getExistingDeviceId(): string | null {
  return localStorage.getItem(DEVICE_ID_KEY);
}
