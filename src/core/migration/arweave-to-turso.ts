/**
 * Migration from Arweave (encrypted localStorage cache) to Turso
 *
 * For users with existing encrypted prompts, this:
 * 1. Gets their wallet address from cached profile
 * 2. Uses wallet + password to derive decryption key
 * 3. Decrypts all cached prompts
 * 4. Uploads to Turso
 */

import { getProfile, getCachedPrompts, getSavedSearches } from '@/core/storage/cache';
import { getDeviceId } from '@/core/identity/device';
import * as tursoQueries from '@/backend/api/turso-queries';
import { getProtocolVersion } from '@/backend/config/arweave';

const MIGRATION_KEY = 'pktpmt_turso_migrated';
const MIGRATION_ATTEMPTED_KEY = 'pktpmt_turso_migration_attempted';

export interface MigrationResult {
  success: boolean;
  promptsMigrated: number;
  promptsFailed: number;
  searchesMigrated: number;
  errors: string[];
}

export interface MigrationStatus {
  hasEncryptedPrompts: boolean;
  hasCachedPrompts: boolean;
  walletAddress: string | null;
  promptCount: number;
  alreadyMigrated: boolean;
  migrationAttempted: boolean;
}

/**
 * Check if migration is needed/possible
 */
export function getMigrationStatus(): MigrationStatus {
  const profile = getProfile();
  const cachedPrompts = getCachedPrompts();
  const promptList = Object.values(cachedPrompts);

  const hasEncryptedPrompts = promptList.some(
    p => !p.tags.some(tag => tag.toLowerCase() === 'public')
  );

  return {
    hasEncryptedPrompts,
    hasCachedPrompts: promptList.length > 0,
    walletAddress: profile?.address || null,
    promptCount: promptList.length,
    alreadyMigrated: localStorage.getItem(MIGRATION_KEY) !== null,
    migrationAttempted: localStorage.getItem(MIGRATION_ATTEMPTED_KEY) !== null,
  };
}

/**
 * Skip migration and mark as attempted
 */
export function skipMigration(): void {
  localStorage.setItem(MIGRATION_ATTEMPTED_KEY, Date.now().toString());
}

/**
 * Derive master encryption key from wallet address + password
 * This replicates the logic from crypto.ts but with explicit wallet address
 */
async function deriveMasterKey(walletAddress: string, password: string): Promise<CryptoKey> {
  const combinedInput = new TextEncoder().encode(`${walletAddress}:${password}`);

  const importedKey = await crypto.subtle.importKey(
    'raw',
    combinedInput,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const protocolVersion = getProtocolVersion().toLowerCase();
  const salt = new TextEncoder().encode(protocolVersion);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 250000,
      hash: 'SHA-256',
    },
    importedKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['decrypt']
  );
}

/**
 * Decrypt content using master key
 */
async function decryptContent(
  encryptedData: { encryptedContent: string; encryptedKey: string; iv: string },
  masterKey: CryptoKey
): Promise<string> {
  // Parse encrypted key data (contains IV + encrypted key)
  const combinedKeyData = base64ToArrayBuffer(encryptedData.encryptedKey);
  const keyIv = combinedKeyData.slice(0, 12);
  const encryptedKeyBuffer = combinedKeyData.slice(12);

  // Decrypt the content key using the master key
  const decryptedKeyBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: keyIv },
    masterKey,
    encryptedKeyBuffer
  );

  // Import the decrypted content key
  const contentKey = await crypto.subtle.importKey(
    'raw',
    decryptedKeyBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Decrypt content
  const iv = base64ToArrayBuffer(encryptedData.iv);
  const encryptedContent = base64ToArrayBuffer(encryptedData.encryptedContent);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    contentKey,
    encryptedContent
  );

  return new TextDecoder().decode(decryptedBuffer);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Validate password by attempting to decrypt one prompt
 */
export async function validatePassword(walletAddress: string, password: string): Promise<boolean> {
  const cachedPrompts = getCachedPrompts();
  const promptList = Object.values(cachedPrompts);

  // Find an encrypted prompt to test
  const encryptedPrompt = promptList.find(
    p => !p.tags.some(tag => tag.toLowerCase() === 'public') &&
      typeof p.content === 'object' &&
      p.content !== null &&
      'encryptedContent' in p.content
  );

  if (!encryptedPrompt) {
    // No encrypted prompts to validate against - password is "valid" (not needed)
    return true;
  }

  try {
    const masterKey = await deriveMasterKey(walletAddress, password);
    await decryptContent(encryptedPrompt.content as any, masterKey);
    return true;
  } catch (error) {
    console.error('[Migration] Password validation failed:', error);
    return false;
  }
}

/**
 * Run the migration
 */
export async function migrateToTurso(
  walletAddress: string,
  password: string,
  onProgress?: (current: number, total: number, title: string) => void
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    promptsMigrated: 0,
    promptsFailed: 0,
    searchesMigrated: 0,
    errors: [],
  };

  try {
    // Get or create Turso user
    const deviceId = getDeviceId();
    const user = await tursoQueries.getOrCreateUser(deviceId);

    // Derive master key for decryption
    let masterKey: CryptoKey | null = null;
    try {
      masterKey = await deriveMasterKey(walletAddress, password);
    } catch (error) {
      console.error('[Migration] Failed to derive master key:', error);
    }

    // Get cached prompts
    const cachedPrompts = getCachedPrompts();
    const promptList = Object.values(cachedPrompts);
    const total = promptList.length;

    console.log(`[Migration] Migrating ${total} prompts...`);

    for (let i = 0; i < promptList.length; i++) {
      const prompt = promptList[i];
      onProgress?.(i + 1, total, prompt.title);

      try {
        // Determine if prompt is encrypted
        const isEncrypted = !prompt.tags.some(tag => tag.toLowerCase() === 'public') &&
          typeof prompt.content === 'object' &&
          prompt.content !== null &&
          'encryptedContent' in prompt.content;

        let content = prompt.content as string;

        // Decrypt if needed
        if (isEncrypted && masterKey) {
          try {
            content = await decryptContent(prompt.content as any, masterKey);
          } catch (decryptError) {
            console.error(`[Migration] Failed to decrypt prompt "${prompt.title}":`, decryptError);
            result.errors.push(`Failed to decrypt "${prompt.title}"`);
            result.promptsFailed++;
            continue;
          }
        } else if (isEncrypted && !masterKey) {
          result.errors.push(`Cannot decrypt "${prompt.title}" - no master key`);
          result.promptsFailed++;
          continue;
        }

        // Check if prompt already exists in Turso
        const existing = await tursoQueries.getPromptById(prompt.id);
        if (existing) {
          console.log(`[Migration] Prompt "${prompt.title}" already exists, skipping`);
          result.promptsMigrated++;
          continue;
        }

        // Create in Turso
        await tursoQueries.createPrompt(user.id, {
          id: prompt.id,
          title: prompt.title,
          description: prompt.description,
          content: content,
          tags: prompt.tags.filter(t => t.toLowerCase() !== 'public'), // Remove "public" tag
          createdAt: prompt.createdAt,
          updatedAt: prompt.updatedAt,
        });

        result.promptsMigrated++;
        console.log(`[Migration] Migrated "${prompt.title}"`);
      } catch (error) {
        console.error(`[Migration] Failed to migrate prompt "${prompt.title}":`, error);
        result.errors.push(`Failed to migrate "${prompt.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        result.promptsFailed++;
      }
    }

    // Migrate saved searches
    const savedSearches = getSavedSearches();
    for (const search of savedSearches) {
      try {
        await tursoQueries.saveSavedSearch(user.id, search);
        result.searchesMigrated++;
      } catch (error) {
        console.error(`[Migration] Failed to migrate saved search "${search.name}":`, error);
      }
    }

    // Mark migration as complete
    localStorage.setItem(MIGRATION_KEY, Date.now().toString());
    result.success = result.promptsFailed === 0;

    console.log('[Migration] Complete:', result);
    return result;
  } catch (error) {
    console.error('[Migration] Fatal error:', error);
    result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return result;
  }
}
