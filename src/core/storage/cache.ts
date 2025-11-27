import type { UserProfile, Prompt, PromptMetadata, SavedSearch } from '@/shared/types/prompt';

// Protocol version for versioned storage keys (inlined from arweave config)
// This ensures cache is isolated per protocol version
const PROTOCOL_VERSION = 'pocketpromptv35'; // Pocket-Prompt-v3.5 normalized

const STORAGE_KEYS = {
  PROFILE: `pktpmt_${PROTOCOL_VERSION}_profile`,
  PROMPTS: `pktpmt_${PROTOCOL_VERSION}_prompts`,
  THEME: 'pktpmt_theme', // Theme is shared across versions
  SAVED_SEARCHES: `pktpmt_${PROTOCOL_VERSION}_saved_searches`,
  VIEW_MODE: 'pktpmt_view_mode', // View mode is shared across versions
  ATTACHED_DIRECTORY: 'pktpmt_attached_directory', // Path to attached prompt directory
} as const;

/**
 * Get user profile from localStorage
 */
export function getProfile(): UserProfile | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error reading profile:', error);
    return null;
  }
}

/**
 * Save user profile to localStorage
 */
export function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  } catch (error) {
    console.error('Error saving profile:', error);
  }
}

/**
 * Initialize profile for new user
 */
export function initializeProfile(address: string): UserProfile {
  const profile: UserProfile = {
    address,
    prompts: [],
    lastSync: Date.now(),
  };
  saveProfile(profile);
  return profile;
}

/**
 * Add prompt metadata to profile
 */
export function addPromptToProfile(metadata: PromptMetadata): void {
  const profile = getProfile();
  if (!profile) return;

  // Check if prompt already exists
  const index = profile.prompts.findIndex(p => p.id === metadata.id);
  if (index >= 0) {
    // Update existing
    profile.prompts[index] = metadata;
  } else {
    // Add new
    profile.prompts.unshift(metadata);
  }

  profile.lastSync = Date.now();
  saveProfile(profile);
}

/**
 * Archive prompt (soft delete)
 */
export function archivePrompt(id: string): void {
  const profile = getProfile();
  if (!profile) return;

  const prompt = profile.prompts.find(p => p.id === id);
  if (prompt) {
    prompt.isArchived = true;
    saveProfile(profile);
  }

  // Also update cached prompt
  const cachedPrompts = getCachedPrompts();
  const cachedPrompt = cachedPrompts[id];
  if (cachedPrompt) {
    cachedPrompt.isArchived = true;
    cachePrompt(cachedPrompt);
  }
}

/**
 * Restore archived prompt
 */
export function restorePrompt(id: string): void {
  const profile = getProfile();
  if (!profile) return;

  const prompt = profile.prompts.find(p => p.id === id);
  if (prompt) {
    prompt.isArchived = false;
    saveProfile(profile);
  }

  // Also update cached prompt
  const cachedPrompts = getCachedPrompts();
  const cachedPrompt = cachedPrompts[id];
  if (cachedPrompt) {
    cachedPrompt.isArchived = false;
    cachePrompt(cachedPrompt);
  }
}

/**
 * Get cached prompts from localStorage
 */
export function getCachedPrompts(): Record<string, Prompt> {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.PROMPTS);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error reading cached prompts:', error);
    return {};
  }
}

/**
 * Check if user has any encrypted prompts in cache
 * Returns true if any cached prompts were encrypted (don't have "public" tag)
 */
export function hasEncryptedPromptsInCache(): boolean {
  try {
    const cached = getCachedPrompts();
    const prompts = Object.values(cached);

    // Check if any prompts were encrypted (no "public" tag)
    return prompts.some(prompt =>
      !prompt.tags.some(tag => tag.toLowerCase() === 'public')
    );
  } catch (error) {
    console.error('Error checking encrypted prompts:', error);
    return false;
  }
}

/**
 * Cache a single prompt
 */
export function cachePrompt(prompt: Prompt): void {
  try {
    const cached = getCachedPrompts();
    cached[prompt.id] = prompt;
    localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(cached));
  } catch (error) {
    console.error('Error caching prompt:', error);
  }
}

/**
 * Get cached prompt by ID
 */
export function getCachedPrompt(id: string): Prompt | null {
  const cached = getCachedPrompts();
  return cached[id] || null;
}

/**
 * Clear all cached prompts (useful for logout)
 */
export function clearCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PROMPTS);
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

/**
 * Get theme preference
 */
export function getTheme(): 'light' | 'dark' {
  try {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME);
    return theme === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Save theme preference
 */
export function saveTheme(theme: 'light' | 'dark'): void {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch (error) {
    console.error('Error saving theme:', error);
  }
}

/**
 * Get all saved searches from localStorage
 */
export function getSavedSearches(): SavedSearch[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SAVED_SEARCHES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading saved searches:', error);
    return [];
  }
}

/**
 * Save a single saved search (creates or updates)
 */
export function saveSavedSearch(search: SavedSearch): void {
  try {
    const searches = getSavedSearches();
    const index = searches.findIndex(s => s.id === search.id);

    if (index >= 0) {
      // Update existing
      searches[index] = {
        ...search,
        updatedAt: Date.now(),
      };
    } else {
      // Add new
      searches.push(search);
    }

    localStorage.setItem(STORAGE_KEYS.SAVED_SEARCHES, JSON.stringify(searches));
  } catch (error) {
    console.error('Error saving saved search:', error);
  }
}

/**
 * Delete a saved search by ID
 */
export function deleteSavedSearch(id: string): void {
  try {
    const searches = getSavedSearches();
    const filtered = searches.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SAVED_SEARCHES, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting saved search:', error);
  }
}

/**
 * Get a saved search by ID
 */
export function getSavedSearch(id: string): SavedSearch | null {
  const searches = getSavedSearches();
  return searches.find(s => s.id === id) || null;
}

/**
 * Get view mode preference (list or cards)
 */
export function getViewMode(): 'list' | 'cards' {
  try {
    const mode = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
    return mode === 'cards' ? 'cards' : 'list'; // Default to list
  } catch {
    return 'list';
  }
}

/**
 * Save view mode preference
 */
export function saveViewMode(mode: 'list' | 'cards'): void {
  try {
    localStorage.setItem(STORAGE_KEYS.VIEW_MODE, mode);
  } catch (error) {
    console.error('Error saving view mode:', error);
  }
}

/**
 * Get attached directory path
 * When set, the app uses this directory as the source of truth for prompts
 */
export function getAttachedDirectory(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.ATTACHED_DIRECTORY);
  } catch {
    return null;
  }
}

/**
 * Set attached directory path
 * Pass null to detach and return to database mode
 */
export function setAttachedDirectory(path: string | null): void {
  try {
    if (path === null) {
      localStorage.removeItem(STORAGE_KEYS.ATTACHED_DIRECTORY);
    } else {
      localStorage.setItem(STORAGE_KEYS.ATTACHED_DIRECTORY, path);
    }
  } catch (error) {
    console.error('Error saving attached directory:', error);
  }
}

/**
 * Check if app is in directory mode (has an attached directory)
 */
export function isDirectoryMode(): boolean {
  return getAttachedDirectory() !== null;
}