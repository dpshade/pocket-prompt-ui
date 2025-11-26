/**
 * Turso (libSQL) client for edge database operations
 */
import { createClient, type Client, type ResultSet } from '@libsql/client';

let client: Client | null = null;

/**
 * Get or create Turso client
 * Lazily initializes the client on first use
 */
export function getTursoClient(): Client {
  if (!client) {
    const url = import.meta.env.VITE_TURSO_DATABASE_URL;
    const authToken = import.meta.env.VITE_TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error('VITE_TURSO_DATABASE_URL environment variable is not set');
    }

    client = createClient({
      url,
      authToken,
    });
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
 * Check if Turso is configured
 */
export function isTursoConfigured(): boolean {
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
