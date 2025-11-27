/**
 * Turso database queries for prompts, users, tags, and saved searches
 */
import { executeQuery, executeMutation } from './turso';
import type { Prompt, PromptVersion, SavedSearch, BooleanExpression } from '@/shared/types/prompt';

// =============================================================================
// Types
// =============================================================================

export interface TursoUser {
  id: string;
  device_id: string;
  created_at: number;
  last_seen_at: number;
}

interface TursoPromptRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  content: string;
  is_archived: number;
  created_at: number;
  updated_at: number;
  current_version: number;
}

interface TursoVersionRow {
  id: string;
  prompt_id: string;
  version: number;
  content: string;
  change_note: string | null;
  created_at: number;
}

interface TursoTagRow {
  id: string;
  name: string;
}

interface TursoSavedSearchRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  expression: string;
  text_query: string | null;
  updated_at: number;
}

// =============================================================================
// User Operations
// =============================================================================

/**
 * Get or create a user by device ID
 */
export async function getOrCreateUser(deviceId: string): Promise<TursoUser> {
  // Try to find existing user
  const existing = await executeQuery<TursoUser>(
    'SELECT * FROM users WHERE device_id = ?',
    [deviceId]
  );

  if (existing.length > 0) {
    // Update last seen
    await executeMutation(
      'UPDATE users SET last_seen_at = ? WHERE id = ?',
      [Date.now(), existing[0].id]
    );
    return existing[0];
  }

  // Create new user
  const id = crypto.randomUUID();
  const now = Date.now();

  await executeMutation(
    'INSERT INTO users (id, device_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
    [id, deviceId, now, now]
  );

  return { id, device_id: deviceId, created_at: now, last_seen_at: now };
}

/**
 * Update user's last seen timestamp
 */
export async function updateLastSeen(userId: string): Promise<void> {
  await executeMutation(
    'UPDATE users SET last_seen_at = ? WHERE id = ?',
    [Date.now(), userId]
  );
}

// =============================================================================
// Prompt Operations
// =============================================================================

/**
 * Get all prompts for a user
 */
export async function getPromptsByUserId(
  userId: string,
  options: { includeArchived?: boolean } = {}
): Promise<Prompt[]> {
  const { includeArchived = false } = options;

  const whereClause = includeArchived
    ? 'WHERE p.user_id = ?'
    : 'WHERE p.user_id = ? AND p.is_archived = 0';

  const rows = await executeQuery<TursoPromptRow>(
    `SELECT * FROM prompts p ${whereClause} ORDER BY p.updated_at DESC`,
    [userId]
  );

  // Fetch tags for all prompts in batch
  const promptIds = rows.map((r) => r.id);
  const tagsMap = await getTagsForPrompts(promptIds);

  // Fetch versions for all prompts
  const versionsMap = await getVersionsForPrompts(promptIds);

  return rows.map((row) => rowToPrompt(row, tagsMap[row.id] || [], versionsMap[row.id] || []));
}

/**
 * Get a single prompt by ID
 */
export async function getPromptById(promptId: string): Promise<Prompt | null> {
  const rows = await executeQuery<TursoPromptRow>(
    'SELECT * FROM prompts WHERE id = ?',
    [promptId]
  );

  if (rows.length === 0) return null;

  const tags = await getTagsByPromptId(promptId);
  const versions = await getVersionHistory(promptId);

  return rowToPrompt(rows[0], tags, versions);
}

/**
 * Create a new prompt
 */
export async function createPrompt(
  userId: string,
  data: {
    id?: string;
    title: string;
    description: string;
    content: string;
    tags: string[];
    createdAt?: number;
    updatedAt?: number;
  }
): Promise<Prompt> {
  const id = data.id || crypto.randomUUID();
  const now = Date.now();
  const createdAt = data.createdAt || now;
  const updatedAt = data.updatedAt || now;

  // Insert prompt
  await executeMutation(
    `INSERT INTO prompts (id, user_id, title, description, content, is_archived, created_at, updated_at, current_version)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)`,
    [id, userId, data.title, data.description, data.content, createdAt, updatedAt]
  );

  // Create initial version
  await createVersion(id, data.content, 'Initial version');

  // Set tags
  await setPromptTags(id, data.tags);

  return {
    id,
    title: data.title,
    description: data.description,
    content: data.content,
    tags: data.tags,
    currentTxId: id, // Use ID as txId for compatibility
    versions: [
      {
        txId: id,
        version: 1,
        timestamp: createdAt,
        changeNote: 'Initial version',
      },
    ],
    createdAt,
    updatedAt,
    isArchived: false,
    isSynced: true,
  };
}

/**
 * Update an existing prompt
 */
export async function updatePrompt(
  promptId: string,
  updates: Partial<{
    title: string;
    description: string;
    content: string;
    tags: string[];
  }>,
  changeNote?: string
): Promise<Prompt | null> {
  const existing = await getPromptById(promptId);
  if (!existing) return null;

  const now = Date.now();
  const contentChanged = updates.content !== undefined && updates.content !== existing.content;

  // Build update query dynamically
  const setClauses: string[] = ['updated_at = ?'];
  const values: (string | number)[] = [now];

  if (updates.title !== undefined) {
    setClauses.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    values.push(updates.description);
  }
  if (updates.content !== undefined) {
    setClauses.push('content = ?');
    values.push(updates.content);
  }

  // Increment version if content changed
  if (contentChanged) {
    setClauses.push('current_version = current_version + 1');
  }

  values.push(promptId);

  await executeMutation(
    `UPDATE prompts SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  );

  // Create new version if content changed
  if (contentChanged && updates.content) {
    const newVersion = existing.versions.length + 1;
    await createVersionWithNumber(promptId, updates.content, newVersion, changeNote);
  }

  // Update tags if provided
  if (updates.tags !== undefined) {
    await setPromptTags(promptId, updates.tags);
  }

  return getPromptById(promptId);
}

/**
 * Archive a prompt (soft delete)
 */
export async function archivePrompt(promptId: string): Promise<void> {
  await executeMutation(
    'UPDATE prompts SET is_archived = 1, updated_at = ? WHERE id = ?',
    [Date.now(), promptId]
  );
}

/**
 * Restore an archived prompt
 */
export async function restorePrompt(promptId: string): Promise<void> {
  await executeMutation(
    'UPDATE prompts SET is_archived = 0, updated_at = ? WHERE id = ?',
    [Date.now(), promptId]
  );
}

/**
 * Permanently delete a prompt
 */
export async function deletePrompt(promptId: string): Promise<void> {
  // Tags and versions will be deleted via CASCADE
  await executeMutation('DELETE FROM prompts WHERE id = ?', [promptId]);
}

// =============================================================================
// Version Operations
// =============================================================================

/**
 * Get version history for a prompt
 */
export async function getVersionHistory(promptId: string): Promise<PromptVersion[]> {
  const rows = await executeQuery<TursoVersionRow>(
    'SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC',
    [promptId]
  );

  return rows.map((row) => ({
    txId: row.id,
    version: row.version,
    timestamp: row.created_at,
    changeNote: row.change_note || undefined,
  }));
}

/**
 * Get version content by version ID (txId)
 */
export async function getVersionContent(versionId: string): Promise<string | null> {
  const rows = await executeQuery<TursoVersionRow>(
    'SELECT content FROM prompt_versions WHERE id = ?',
    [versionId]
  );

  if (rows.length === 0) return null;
  return rows[0].content;
}

/**
 * Get full version data (content included) for a prompt
 */
export async function getVersionWithContent(promptId: string, versionNumber: number): Promise<{
  id: string;
  version: number;
  content: string;
  changeNote: string | null;
  createdAt: number;
} | null> {
  const rows = await executeQuery<TursoVersionRow>(
    'SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?',
    [promptId, versionNumber]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    version: row.version,
    content: row.content,
    changeNote: row.change_note,
    createdAt: row.created_at,
  };
}

/**
 * Create a new version entry
 */
async function createVersion(
  promptId: string,
  content: string,
  changeNote?: string
): Promise<void> {
  const id = crypto.randomUUID();

  await executeMutation(
    `INSERT INTO prompt_versions (id, prompt_id, version, content, change_note, created_at)
     VALUES (?, ?, 1, ?, ?, ?)`,
    [id, promptId, content, changeNote || null, Date.now()]
  );
}

/**
 * Create a version with explicit version number
 */
async function createVersionWithNumber(
  promptId: string,
  content: string,
  version: number,
  changeNote?: string
): Promise<void> {
  const id = crypto.randomUUID();

  await executeMutation(
    `INSERT INTO prompt_versions (id, prompt_id, version, content, change_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, promptId, version, content, changeNote || null, Date.now()]
  );
}

/**
 * Get versions for multiple prompts in batch
 */
async function getVersionsForPrompts(
  promptIds: string[]
): Promise<Record<string, PromptVersion[]>> {
  if (promptIds.length === 0) return {};

  const placeholders = promptIds.map(() => '?').join(',');
  const rows = await executeQuery<TursoVersionRow>(
    `SELECT * FROM prompt_versions WHERE prompt_id IN (${placeholders}) ORDER BY version DESC`,
    promptIds
  );

  const map: Record<string, PromptVersion[]> = {};
  for (const row of rows) {
    if (!map[row.prompt_id]) map[row.prompt_id] = [];
    map[row.prompt_id].push({
      txId: row.id,
      version: row.version,
      timestamp: row.created_at,
      changeNote: row.change_note || undefined,
    });
  }

  return map;
}

// =============================================================================
// Tag Operations
// =============================================================================

/**
 * Get tags for a prompt
 */
export async function getTagsByPromptId(promptId: string): Promise<string[]> {
  const rows = await executeQuery<TursoTagRow>(
    `SELECT t.* FROM tags t
     JOIN prompt_tags pt ON t.id = pt.tag_id
     WHERE pt.prompt_id = ?
     ORDER BY t.name`,
    [promptId]
  );

  return rows.map((r) => r.name);
}

/**
 * Get tags for multiple prompts in batch
 */
async function getTagsForPrompts(promptIds: string[]): Promise<Record<string, string[]>> {
  if (promptIds.length === 0) return {};

  const placeholders = promptIds.map(() => '?').join(',');
  const rows = await executeQuery<{ prompt_id: string; name: string }>(
    `SELECT pt.prompt_id, t.name FROM tags t
     JOIN prompt_tags pt ON t.id = pt.tag_id
     WHERE pt.prompt_id IN (${placeholders})
     ORDER BY t.name`,
    promptIds
  );

  const map: Record<string, string[]> = {};
  for (const row of rows) {
    if (!map[row.prompt_id]) map[row.prompt_id] = [];
    map[row.prompt_id].push(row.name);
  }

  return map;
}

/**
 * Set tags for a prompt (replaces existing)
 */
export async function setPromptTags(promptId: string, tags: string[]): Promise<void> {
  // Remove existing tags
  await executeMutation('DELETE FROM prompt_tags WHERE prompt_id = ?', [promptId]);

  if (tags.length === 0) return;

  // Get or create tags and link them
  for (const tagName of tags) {
    const normalizedName = tagName.trim();
    if (!normalizedName) continue;

    // Get or create tag
    let tagRows = await executeQuery<TursoTagRow>(
      'SELECT * FROM tags WHERE name = ? COLLATE NOCASE',
      [normalizedName]
    );

    let tagId: string;
    if (tagRows.length === 0) {
      tagId = crypto.randomUUID();
      await executeMutation('INSERT INTO tags (id, name) VALUES (?, ?)', [tagId, normalizedName]);
    } else {
      tagId = tagRows[0].id;
    }

    // Link tag to prompt
    await executeMutation(
      'INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)',
      [promptId, tagId]
    );
  }
}

/**
 * Get all unique tags for a user's prompts
 */
export async function getAllUserTags(userId: string): Promise<string[]> {
  const rows = await executeQuery<{ name: string }>(
    `SELECT DISTINCT t.name FROM tags t
     JOIN prompt_tags pt ON t.id = pt.tag_id
     JOIN prompts p ON pt.prompt_id = p.id
     WHERE p.user_id = ?
     ORDER BY t.name`,
    [userId]
  );

  return rows.map((r) => r.name);
}

// =============================================================================
// Saved Search Operations
// =============================================================================

/**
 * Get all saved searches for a user
 */
export async function getSavedSearches(userId: string): Promise<SavedSearch[]> {
  const rows = await executeQuery<TursoSavedSearchRow>(
    'SELECT * FROM saved_searches WHERE user_id = ? ORDER BY updated_at DESC',
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    expression: JSON.parse(row.expression) as BooleanExpression,
    textQuery: row.text_query || undefined,
    updatedAt: row.updated_at,
  }));
}

/**
 * Save a saved search (create or update)
 */
export async function saveSavedSearch(userId: string, search: SavedSearch): Promise<void> {
  const existing = await executeQuery<TursoSavedSearchRow>(
    'SELECT id FROM saved_searches WHERE id = ?',
    [search.id]
  );

  if (existing.length > 0) {
    // Update
    await executeMutation(
      `UPDATE saved_searches SET name = ?, description = ?, expression = ?, text_query = ?, updated_at = ?
       WHERE id = ?`,
      [
        search.name,
        search.description || null,
        JSON.stringify(search.expression),
        search.textQuery || null,
        Date.now(),
        search.id,
      ]
    );
  } else {
    // Create
    await executeMutation(
      `INSERT INTO saved_searches (id, user_id, name, description, expression, text_query, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        search.id,
        userId,
        search.name,
        search.description || null,
        JSON.stringify(search.expression),
        search.textQuery || null,
        search.updatedAt,
      ]
    );
  }
}

/**
 * Delete a saved search
 */
export async function deleteSavedSearch(searchId: string): Promise<void> {
  await executeMutation('DELETE FROM saved_searches WHERE id = ?', [searchId]);
}

/**
 * Clear all user data from Turso (prompts, versions, tags, saved searches)
 */
export async function clearAllUserData(userId: string): Promise<void> {
  // Delete prompt versions first (foreign key constraint)
  await executeMutation(`
    DELETE FROM prompt_versions 
    WHERE prompt_id IN (
      SELECT id FROM prompts WHERE user_id = ?
    )
  `, [userId]);

  // Delete prompt tags
  await executeMutation(`
    DELETE FROM prompt_tags 
    WHERE prompt_id IN (
      SELECT id FROM prompts WHERE user_id = ?
    )
  `, [userId]);

  // Delete prompts
  await executeMutation('DELETE FROM prompts WHERE user_id = ?', [userId]);

  // Delete saved searches
  await executeMutation('DELETE FROM saved_searches WHERE user_id = ?', [userId]);
}

// =============================================================================
// Sharing Operations
// =============================================================================

/**
 * Generate a share token for a prompt (creates shareable link)
 */
export async function generateShareToken(promptId: string): Promise<string> {
  // Check if prompt already has a share token
  const existing = await executeQuery<{ share_token: string }>(
    'SELECT share_token FROM prompts WHERE id = ? AND share_token IS NOT NULL',
    [promptId]
  );

  if (existing.length > 0 && existing[0].share_token) {
    return existing[0].share_token;
  }

  // Generate a new share token (URL-safe base64)
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const shareToken = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Save the share token
  await executeMutation(
    'UPDATE prompts SET share_token = ?, updated_at = ? WHERE id = ?',
    [shareToken, Date.now(), promptId]
  );

  return shareToken;
}

/**
 * Get a prompt by its share token (for public viewing)
 */
export async function getPromptByShareToken(shareToken: string): Promise<Prompt | null> {
  const rows = await executeQuery<TursoPromptRow & { share_token: string }>(
    'SELECT * FROM prompts WHERE share_token = ?',
    [shareToken]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  const tags = await getTagsByPromptId(row.id);
  const versions = await getVersionHistory(row.id);

  return rowToPrompt(row, tags, versions);
}

/**
 * Remove share token (make prompt private again)
 */
export async function removeShareToken(promptId: string): Promise<void> {
  await executeMutation(
    'UPDATE prompts SET share_token = NULL, updated_at = ? WHERE id = ?',
    [Date.now(), promptId]
  );
}

/**
 * Get share token for a prompt
 */
export async function getShareToken(promptId: string): Promise<string | null> {
  const rows = await executeQuery<{ share_token: string | null }>(
    'SELECT share_token FROM prompts WHERE id = ?',
    [promptId]
  );

  if (rows.length === 0) return null;
  return rows[0].share_token;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert database row to Prompt type
 */
function rowToPrompt(row: TursoPromptRow, tags: string[], versions: PromptVersion[]): Prompt {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    content: row.content,
    tags,
    currentTxId: row.id, // Use ID for compatibility
    versions: versions.length > 0 ? versions : [
      {
        txId: row.id,
        version: row.current_version,
        timestamp: row.created_at,
      },
    ],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isArchived: row.is_archived === 1,
    isSynced: true, // Always synced with Turso
  };
}
