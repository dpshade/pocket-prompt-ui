/**
 * Turso (libSQL) client for edge database operations
 * Supports both local-first (file:) and cloud sync modes
 */
import { createClient, type Client, type ResultSet } from '@libsql/client';

let client: Client | null = null;

// Check if running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Local database path for Tauri desktop app
const LOCAL_DB_URL = 'file:prompts.db';

/**
 * Get or create Turso client
 * - In Tauri: Uses local SQLite file by default
 * - In web: Requires VITE_TURSO_DATABASE_URL
 * - Sync URL can be provided to enable cloud sync
 */
export function getTursoClient(): Client {
  if (!client) {
    const cloudUrl = import.meta.env.VITE_TURSO_DATABASE_URL;
    const authToken = import.meta.env.VITE_TURSO_AUTH_TOKEN;

    // Use local file in Tauri, or cloud URL in web
    const url = isTauri && !cloudUrl ? LOCAL_DB_URL : cloudUrl;

    if (!url) {
      throw new Error('VITE_TURSO_DATABASE_URL environment variable is not set');
    }

    // For local file mode, no auth token needed
    const isLocalFile = url.startsWith('file:');

    client = createClient({
      url,
      authToken: isLocalFile ? undefined : authToken,
    });

    console.log(`[Turso] Client initialized: ${isLocalFile ? 'local mode' : 'cloud mode'}`);
  }
  return client;
}

/**
 * Execute a SQL query and return typed results
 */
export async function executeQuery<T>(
  sql: string,
  args: (string | number | null)[] = []
): Promise<T[]> {
  const turso = getTursoClient();
  const result = await turso.execute({ sql, args });
  return result.rows as T[];
}

/**
 * Execute a SQL mutation (INSERT, UPDATE, DELETE)
 * Returns number of affected rows
 */
export async function executeMutation(
  sql: string,
  args: (string | number | null)[] = []
): Promise<number> {
  const turso = getTursoClient();
  const result = await turso.execute({ sql, args });
  return result.rowsAffected;
}

/**
 * Execute multiple statements in a batch transaction
 */
export async function executeBatch(
  statements: Array<{ sql: string; args?: (string | number | null)[] }>
): Promise<ResultSet[]> {
  const turso = getTursoClient();
  return turso.batch(
    statements.map((s) => ({ sql: s.sql, args: s.args || [] })),
    'write'
  );
}

/**
 * Check if Turso is configured (cloud or local)
 */
export function isTursoConfigured(): boolean {
  // In Tauri, we always have local mode available
  if (isTauri) return true;
  // In web, need cloud URL
  return !!import.meta.env.VITE_TURSO_DATABASE_URL;
}

/**
 * Check if running in local-only mode (no cloud sync)
 */
export function isLocalMode(): boolean {
  return isTauri && !import.meta.env.VITE_TURSO_DATABASE_URL;
}

/**
 * Check if cloud sync is enabled
 */
export function isCloudSyncEnabled(): boolean {
  return !!import.meta.env.VITE_TURSO_DATABASE_URL;
}

/**
 * Close the client connection
 */
export function closeTursoClient(): void {
  if (client) {
    client.close();
    client = null;
  }
}
