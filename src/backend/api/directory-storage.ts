/**
 * Directory Storage Backend
 *
 * Provides real-time 1-to-1 mapping between the app and a local directory.
 * When attached, the filesystem IS the source of truth for prompts.
 * - Reads all valid .md files from the directory
 * - Creates new .md files when prompts are added
 * - Updates .md files when prompts are edited
 * - Deletes .md files when prompts are deleted
 * - Watches for filesystem changes and syncs to UI
 */

import { readDir, readTextFile, writeTextFile, remove, exists, watch } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { parseMarkdownPrompt, type ImportedPrompt } from '@/shared/utils/import';
import type { Prompt } from '@/shared/types/prompt';

// Event listeners for directory changes
type DirectoryChangeListener = (prompts: Prompt[]) => void;
const changeListeners: Set<DirectoryChangeListener> = new Set();
let currentWatchUnsubscribe: (() => void) | null = null;

/**
 * Prompt to markdown conversion (matches UploadDialog export format)
 */
function promptToMarkdown(prompt: Prompt): string {
  const frontmatter = [
    '---',
    `id: ${prompt.id}`,
    `title: "${prompt.title.replace(/"/g, '\\"')}"`,
  ];

  if (prompt.description) {
    frontmatter.push(`description: "${prompt.description.replace(/"/g, '\\"')}"`);
  }

  if (prompt.tags.length > 0) {
    frontmatter.push(`tags:`);
    prompt.tags.forEach(tag => {
      frontmatter.push(`  - ${tag}`);
    });
  }

  frontmatter.push(`created_at: ${new Date(prompt.createdAt).toISOString()}`);
  frontmatter.push(`updated_at: ${new Date(prompt.updatedAt).toISOString()}`);

  if (prompt.isArchived) {
    frontmatter.push(`archived: true`);
  }

  frontmatter.push('---');
  frontmatter.push('');
  frontmatter.push(prompt.content);

  return frontmatter.join('\n');
}

/**
 * Sanitize filename for filesystem
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}

/**
 * Convert ImportedPrompt to full Prompt type
 */
function importedToPrompt(imported: ImportedPrompt, filePath: string): Prompt & { _filePath: string } {
  return {
    id: imported.id,
    title: imported.title,
    description: imported.description,
    content: imported.content,
    tags: imported.tags,
    currentTxId: '', // Not used in directory mode
    versions: [],
    createdAt: imported.createdAt || Date.now(),
    updatedAt: imported.updatedAt || Date.now(),
    isArchived: imported.isArchived || false,
    isSynced: true,
    // Store the file path for updates/deletes
    _filePath: filePath,
  };
}

/**
 * Open a directory picker dialog
 */
export async function selectDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Prompts Directory',
  });

  return selected as string | null;
}

/**
 * Read all valid prompts from a directory
 */
export async function readPromptsFromDirectory(directoryPath: string): Promise<Prompt[]> {
  const prompts: Prompt[] = [];

  try {
    const entries = await readDir(directoryPath);

    for (const entry of entries) {
      // Only process .md files
      if (!entry.name?.endsWith('.md')) continue;

      const filePath = `${directoryPath}/${entry.name}`;

      try {
        const content = await readTextFile(filePath);
        const result = parseMarkdownPrompt(content);

        if (result.success && result.prompt) {
          prompts.push(importedToPrompt(result.prompt, filePath));
        }
        // Invalid files are silently ignored per requirements
      } catch (error) {
        console.warn(`Failed to read ${filePath}:`, error);
        // Continue processing other files
      }
    }
  } catch (error) {
    console.error('Failed to read directory:', error);
    throw error;
  }

  // Sort by updated time, newest first
  return prompts.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Write a prompt to the directory as a markdown file
 */
export async function writePromptToDirectory(
  directoryPath: string,
  prompt: Prompt
): Promise<string> {
  const filename = `${sanitizeFilename(prompt.title)}.md`;
  const filePath = `${directoryPath}/${filename}`;

  const markdown = promptToMarkdown(prompt);
  await writeTextFile(filePath, markdown);

  return filePath;
}

/**
 * Update an existing prompt file
 * If the title changed, creates a new file and deletes the old one
 */
export async function updatePromptInDirectory(
  directoryPath: string,
  prompt: Prompt,
  oldFilePath?: string
): Promise<string> {
  const newFilename = `${sanitizeFilename(prompt.title)}.md`;
  const newFilePath = `${directoryPath}/${newFilename}`;

  // Write the new/updated content
  const markdown = promptToMarkdown(prompt);
  await writeTextFile(newFilePath, markdown);

  // If the path changed (title was renamed), delete the old file
  if (oldFilePath && oldFilePath !== newFilePath) {
    try {
      const oldExists = await exists(oldFilePath);
      if (oldExists) {
        await remove(oldFilePath);
      }
    } catch (error) {
      console.warn('Failed to remove old file after rename:', error);
    }
  }

  return newFilePath;
}

/**
 * Delete a prompt file from the directory
 */
export async function deletePromptFromDirectory(filePath: string): Promise<void> {
  try {
    const fileExists = await exists(filePath);
    if (fileExists) {
      await remove(filePath);
    }
  } catch (error) {
    console.error('Failed to delete prompt file:', error);
    throw error;
  }
}

/**
 * Find the file path for a prompt by its ID
 */
export async function findPromptFilePath(
  directoryPath: string,
  promptId: string
): Promise<string | null> {
  try {
    const entries = await readDir(directoryPath);

    for (const entry of entries) {
      if (!entry.name?.endsWith('.md')) continue;

      const filePath = `${directoryPath}/${entry.name}`;

      try {
        const content = await readTextFile(filePath);
        const result = parseMarkdownPrompt(content);

        if (result.success && result.prompt && result.prompt.id === promptId) {
          return filePath;
        }
      } catch {
        // Continue searching
      }
    }
  } catch (error) {
    console.error('Failed to search directory:', error);
  }

  return null;
}

/**
 * Start watching a directory for changes
 * Falls back to polling if native watch isn't available
 */
export async function watchDirectory(
  directoryPath: string,
  onChange: (prompts: Prompt[]) => void
): Promise<() => void> {
  // Stop any existing watcher
  if (currentWatchUnsubscribe) {
    currentWatchUnsubscribe();
    currentWatchUnsubscribe = null;
  }

  // Add listener
  changeListeners.add(onChange);

  // Debounce reloads to avoid rapid re-reads
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const reloadPrompts = async () => {
    try {
      console.log('[DirectoryStorage] Reloading prompts from directory');
      const prompts = await readPromptsFromDirectory(directoryPath);
      console.log(`[DirectoryStorage] Reloaded ${prompts.length} prompts`);
      changeListeners.forEach(listener => listener(prompts));
    } catch (error) {
      console.error('Failed to reload prompts after change:', error);
    }
  };

  const debouncedReload = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(reloadPrompts, 300);
  };

  let unsubscribeWatch: (() => void) | null = null;

  // Try native file watching first
  try {
    const watchResult = await watch(
      directoryPath,
      (event) => {
        console.log('[DirectoryStorage] File change detected:', event);
        debouncedReload();
      },
      { recursive: false }
    );
    unsubscribeWatch = watchResult;
    console.log('[DirectoryStorage] Native file watching enabled');
  } catch (error) {
    // Fall back to polling if watch isn't available
    console.warn('[DirectoryStorage] Native watch not available, using polling:', error);

    // Poll every 2 seconds for changes
    pollInterval = setInterval(async () => {
      try {
        const entries = await readDir(directoryPath);
        // Simple check: if any file was modified, reload
        // In a real implementation, you'd track mtimes properly
        const hasChanges = entries.some(e => e.name?.endsWith('.md'));
        if (hasChanges) {
          console.log('[DirectoryStorage] Polling detected potential changes');
          debouncedReload();
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  }

  currentWatchUnsubscribe = () => {
    if (unsubscribeWatch) {
      unsubscribeWatch();
    }
    if (pollInterval) {
      clearInterval(pollInterval);
    }
    changeListeners.delete(onChange);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  };

  return currentWatchUnsubscribe;
}

/**
 * Stop watching the directory
 */
export function stopWatching(): void {
  if (currentWatchUnsubscribe) {
    currentWatchUnsubscribe();
    currentWatchUnsubscribe = null;
  }
  changeListeners.clear();
}

/**
 * Generate a unique ID for new prompts
 */
export function generatePromptId(): string {
  return `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
