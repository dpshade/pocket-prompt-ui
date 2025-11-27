import { create } from 'zustand';
import type { Prompt, PromptMetadata, BooleanExpression, SavedSearch } from '@/shared/types/prompt';
import { getCachedPrompts, cachePrompt, addPromptToProfile, archivePrompt as archivePromptStorage, restorePrompt as restorePromptStorage } from '@/core/storage/cache';
import { indexPrompts, addToIndex, removeFromIndex } from '@/core/search';
import { getDeviceId } from '@/core/identity/device';
import * as tursoQueries from '@/backend/api/turso-queries';
import * as directoryStorage from '@/backend/api/directory-storage';
import { useSyncMode } from './useSyncMode';

// Notification callbacks for upload tracking
export type UploadStartCallback = (txId: string, title: string) => void;
export type UploadCompleteCallback = (txId: string) => void;

interface PromptsState {
  prompts: Prompt[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  selectedTags: string[];
  booleanExpression: BooleanExpression | null;
  activeSavedSearch: SavedSearch | null;
  onUploadStart?: UploadStartCallback;
  onUploadComplete?: UploadCompleteCallback;

  // Sync state - now managed by useSyncMode hook
  directorySyncing: boolean; // True when syncing with attached directory

  loadPrompts: (password?: string) => Promise<void>;
  addPrompt: (prompt: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>, password?: string) => Promise<boolean>;
  updatePrompt: (id: string, updates: Partial<Prompt>, password?: string) => Promise<boolean>;
  archivePrompt: (id: string, password?: string) => Promise<void>;
  restorePrompt: (id: string, password?: string) => Promise<void>;
  deletePrompt: (id: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  toggleTag: (tag: string) => void;
  clearFilters: () => void;
  setBooleanExpression: (expression: BooleanExpression | null, textQuery?: string) => void;
  loadSavedSearch: (search: SavedSearch) => void;
  clearBooleanSearch: () => void;
  setUploadCallbacks: (onStart?: UploadStartCallback, onComplete?: UploadCompleteCallback) => void;

  // Sync methods - now delegated to useSyncMode hook
  resetAllData: () => Promise<void>;
  set: (state: Partial<PromptsState>) => void;
}

export const usePrompts = create<PromptsState>((set, get) => {
  return {
    prompts: [],
    loading: false,
    error: null,
    searchQuery: '',
    selectedTags: [],
    booleanExpression: null,
    activeSavedSearch: null,
    onUploadStart: undefined,
    onUploadComplete: undefined,

    // Sync state - now managed by useSyncMode hook
    directorySyncing: false,

    loadPrompts: async (_password?: string) => {
    const { currentMode, attachedDirectory } = useSyncMode.getState();
    const isAttachedDirectory = currentMode === 'attached-directory' && attachedDirectory !== null;
    
    console.log('[DEBUG] loadPrompts called:', {
      isAttachedDirectory,
      attachedDirectory,
      hasDirectory: isAttachedDirectory && !!attachedDirectory
    });
    
    // Use explicit sync mode instead of localStorage detection
    if (isAttachedDirectory && attachedDirectory) {
      console.log('[DEBUG] Initializing directory mode with path:', attachedDirectory);
      try {
        return await initializeDirectoryMode(set, get, attachedDirectory);
      } catch (dirError) {
        console.error('[DEBUG] Directory mode failed, falling back to Turso:', dirError);
        // Fall back to Turso if directory fails
        return loadPromptsFromTurso(set, get);
      }
    }
    
    console.log('[DEBUG] Loading from Turso (app-only mode)');
    return loadPromptsFromTurso(set, get);
  },

    addPrompt: async (promptData, _password?: string) => {
      const { currentMode, attachedDirectory } = useSyncMode.getState();
      const isAttachedDirectory = currentMode === 'attached-directory' && attachedDirectory !== null;
      
      if (isAttachedDirectory && attachedDirectory) {
        return addPromptToDirectory(set, get, promptData, attachedDirectory);
      }
      return addPromptToTurso(set, get, promptData);
    },

    updatePrompt: async (id, updates, _password?: string) => {
      const { currentMode, attachedDirectory } = useSyncMode.getState();
      const isAttachedDirectory = currentMode === 'attached-directory' && attachedDirectory !== null;
      
      if (isAttachedDirectory && attachedDirectory) {
        return updatePromptInDirectory(set, get, id, updates, attachedDirectory);
      }
      return updatePromptInTurso(set, get, id, updates);
    },

    archivePrompt: async (id, _password?: string) => {
      const { currentMode, attachedDirectory } = useSyncMode.getState();
      const isAttachedDirectory = currentMode === 'attached-directory' && attachedDirectory !== null;
      
      if (isAttachedDirectory && attachedDirectory) {
        return archivePromptInDirectory(set, get, id, attachedDirectory);
      }
      return archivePromptInTurso(set, get, id);
    },

    restorePrompt: async (id, _password?: string) => {
      const { currentMode, attachedDirectory } = useSyncMode.getState();
      const isAttachedDirectory = currentMode === 'attached-directory' && attachedDirectory !== null;
      
      if (isAttachedDirectory && attachedDirectory) {
        return restorePromptInDirectory(set, get, id, attachedDirectory);
      }
      return restorePromptInTurso(set, get, id);
    },

    deletePrompt: async (id) => {
      const { currentMode, attachedDirectory } = useSyncMode.getState();
      const isAttachedDirectory = currentMode === 'attached-directory' && attachedDirectory !== null;
      
      if (isAttachedDirectory && attachedDirectory) {
        return deletePromptInDirectory(set, get, id, attachedDirectory);
      }
      // In database mode, we just archive (soft delete)
      return archivePromptInTurso(set, get, id);
    },

  setSearchQuery: (query) => {
    console.log('[UsePrompts] Setting search query:', query, 'previous query:', get().searchQuery);
    set({ searchQuery: query });
    console.log('[UsePrompts] Search query updated, new state:', { 
      query: get().searchQuery, 
      hasExpression: !!get().booleanExpression,
      promptsCount: get().prompts.length 
    });
    console.log('[UsePrompts] setSearchQuery completed, state should trigger re-render');
  },

  toggleTag: (tag) => {
    set(state => ({
      selectedTags: state.selectedTags.includes(tag)
        ? state.selectedTags.filter(t => t !== tag)
        : [...state.selectedTags, tag],
    }));
  },

  clearFilters: () => {
    set({ searchQuery: '', selectedTags: [], booleanExpression: null, activeSavedSearch: null });
  },

  setBooleanExpression: (expression, textQuery) => {
    console.log('[UsePrompts] Setting boolean expression:', expression, 'text query:', textQuery);
    const previousState = {
      expression: get().booleanExpression,
      query: get().searchQuery,
      tags: get().selectedTags
    };
    
    set({
      booleanExpression: expression,
      searchQuery: textQuery || '',
      selectedTags: [], // Clear simple tag filters when using boolean
      activeSavedSearch: null, // Clear active saved search if manually setting expression
    });
    
    console.log('[UsePrompts] Boolean expression updated:', {
      previous: previousState,
      new: {
        expression: get().booleanExpression,
        query: get().searchQuery,
        tags: get().selectedTags,
        activeSavedSearch: get().activeSavedSearch
      }
    });
    console.log('[UsePrompts] setBooleanExpression completed, state should trigger re-render');
  },

  loadSavedSearch: (search) => {
    set({
      booleanExpression: search.expression,
      searchQuery: search.textQuery || '',
      selectedTags: [], // Clear simple tag filters
      activeSavedSearch: search,
    });
  },

  clearBooleanSearch: () => {
    set({ booleanExpression: null, activeSavedSearch: null });
  },

  setUploadCallbacks: (onStart, onComplete) => {
    set({ onUploadStart: onStart, onUploadComplete: onComplete });
  },



    resetAllData: async () => {
      // Clear FlexSearch index
      const { indexPrompts } = await import('@/core/search');
      indexPrompts([]); // Clear index by reinitializing with empty array

      // Clear Turso data if user exists
      try {
        const deviceId = getDeviceId();
        const user = await tursoQueries.getOrCreateUser(deviceId);
        await tursoQueries.clearAllUserData(user.id);
      } catch (error) {
        console.warn('Failed to clear Turso data:', error);
      }

      // Clear localStorage cache
      const { clearCache } = await import('@/core/storage/cache');
      clearCache();

      // Detach directory if attached using sync mode hook
      const { detachDirectory, currentMode, attachedDirectory } = useSyncMode.getState();
      const isAttachedDirectory = currentMode === 'attached-directory' && attachedDirectory !== null;
      if (isAttachedDirectory) {
        detachDirectory();
      }

      // Reload prompts (will be empty)
      await get().loadPrompts();
    },

  set: (state) => set(state),
  };
});

// =============================================================================
// Turso Backend Implementation
// =============================================================================

type SetState = (partial: Partial<PromptsState> | ((state: PromptsState) => Partial<PromptsState>)) => void;
type GetState = () => PromptsState;

async function loadPromptsFromTurso(set: SetState, _get: GetState): Promise<void> {
  set({ loading: true, error: null });

  try {
    const deviceId = getDeviceId();
    const user = await tursoQueries.getOrCreateUser(deviceId);

    console.log('Loading prompts from Turso for user:', user.id);

    // Fetch all prompts (including archived for now, filter in UI)
    const prompts = await tursoQueries.getPromptsByUserId(user.id, { includeArchived: true });

    console.log(`Loaded ${prompts.length} prompts from Turso`);

    // Cache locally for offline access
    prompts.forEach(p => cachePrompt(p));

    // Index for search
    indexPrompts(prompts);

    set({ prompts, loading: false });
  } catch (error) {
    console.error('Load prompts error (Turso):', error);

    // Fall back to cache on error
    const cached = getCachedPrompts();
    const cachedPrompts = Object.values(cached);
    indexPrompts(cachedPrompts);

    set({
      prompts: cachedPrompts,
      loading: false,
      error: 'Failed to sync with server. Showing cached data.',
    });
  }
}

async function addPromptToTurso(
  set: SetState,
  get: GetState,
  promptData: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>
): Promise<boolean> {
  try {
    const deviceId = getDeviceId();
    const user = await tursoQueries.getOrCreateUser(deviceId);

    const prompt = await tursoQueries.createPrompt(user.id, {
      title: promptData.title,
      description: promptData.description,
      content: promptData.content,
      tags: promptData.tags,
    });

    // Cache locally
    cachePrompt(prompt);

    // Update profile metadata
    const metadata: PromptMetadata = {
      id: prompt.id,
      title: prompt.title,
      tags: prompt.tags,
      currentTxId: prompt.currentTxId,
      updatedAt: prompt.updatedAt,
      isArchived: false,
    };
    addPromptToProfile(metadata);

    // Add to index and state
    addToIndex(prompt);
    set(state => ({ prompts: [prompt, ...state.prompts] }));

    // Notify if callback set (for UI feedback)
    const { onUploadStart } = get();
    if (onUploadStart) {
      onUploadStart(prompt.id, prompt.title);
    }

    return true;
  } catch (error) {
    console.error('Add prompt error (Turso):', error);
    set({ error: 'Failed to create prompt' });
    return false;
  }
}

async function updatePromptInTurso(
  set: SetState,
  get: GetState,
  id: string,
  updates: Partial<Prompt>
): Promise<boolean> {
  try {
    const state = get();
    const existingPrompt = state.prompts.find(p => p.id === id);
    if (!existingPrompt) {
      throw new Error('Prompt not found');
    }

    const changeNote = updates.content !== existingPrompt.content
      ? 'Content updated'
      : 'Metadata updated';

    const updatedPrompt = await tursoQueries.updatePrompt(id, {
      title: updates.title,
      description: updates.description,
      content: updates.content,
      tags: updates.tags,
    }, changeNote);

    if (!updatedPrompt) {
      throw new Error('Update failed');
    }

    // Cache locally
    cachePrompt(updatedPrompt);

    // Update profile metadata
    const metadata: PromptMetadata = {
      id: updatedPrompt.id,
      title: updatedPrompt.title,
      tags: updatedPrompt.tags,
      currentTxId: updatedPrompt.currentTxId,
      updatedAt: updatedPrompt.updatedAt,
      isArchived: updatedPrompt.isArchived,
    };
    addPromptToProfile(metadata);

    // Update index and state
    addToIndex(updatedPrompt);
    set(state => ({
      prompts: state.prompts.map(p => p.id === id ? updatedPrompt : p),
    }));

    return true;
  } catch (error) {
    console.error('Update prompt error (Turso):', error);
    set({ error: 'Failed to update prompt' });
    return false;
  }
}

async function archivePromptInTurso(set: SetState, get: GetState, id: string): Promise<void> {
  const prompt = get().prompts.find(p => p.id === id);
  if (!prompt) return;

  // Optimistically update UI
  archivePromptStorage(id);
  removeFromIndex(id);
  set(state => ({
    prompts: state.prompts.map(p =>
      p.id === id ? { ...p, isArchived: true } : p
    ),
  }));

  try {
    await tursoQueries.archivePrompt(id);
  } catch (error) {
    console.error('Failed to archive prompt in Turso:', error);
    // UI already updated optimistically
  }
}

async function restorePromptInTurso(set: SetState, get: GetState, id: string): Promise<void> {
  const prompt = get().prompts.find(p => p.id === id);
  if (!prompt) return;

  // Optimistically update UI
  restorePromptStorage(id);
  addToIndex({ ...prompt, isArchived: false });
  set(state => ({
    prompts: state.prompts.map(p =>
      p.id === id ? { ...p, isArchived: false } : p
    ),
  }));

  try {
    await tursoQueries.restorePrompt(id);
  } catch (error) {
    console.error('Failed to restore prompt in Turso:', error);
    // UI already updated optimistically
  }
}

// =============================================================================
// Directory Backend Implementation
// =============================================================================

/**
 * Compare two arrays of prompts to check if they're effectively the same
 * Used to avoid unnecessary sync operations when no actual changes occurred
 */
function arePromptsEqual(prompts1: Prompt[], prompts2: Prompt[]): boolean {
  if (prompts1.length !== prompts2.length) {
    return false;
  }
  
  // Create maps by ID for efficient comparison
  const map1 = new Map(prompts1.map(p => [p.id, p]));
  const map2 = new Map(prompts2.map(p => [p.id, p]));
  
  // Check each prompt for equality
  for (const [id, prompt1] of map1) {
    const prompt2 = map2.get(id);
    if (!prompt2) {
      return false; // Prompt with this ID doesn't exist in second array
    }
    
    // Compare key fields that matter for changes
    if (
      prompt1.title !== prompt2.title ||
      prompt1.description !== prompt2.description ||
      prompt1.content !== prompt2.content ||
      prompt1.updatedAt !== prompt2.updatedAt ||
      prompt1.isArchived !== prompt2.isArchived ||
      JSON.stringify(prompt1.tags.sort()) !== JSON.stringify(prompt2.tags.sort())
    ) {
      return false;
    }
  }
  
  return true;
}

/**
 * Initialize directory mode with comprehensive sync between directory, Turso, and FlexSearch
 * Directory is ALWAYS the source of truth on startup - loads fresh every time
 */
async function initializeDirectoryMode(
  set: SetState,
  _get: GetState,
  directoryPath: string
): Promise<void> {
  console.log('[DEBUG] initializeDirectoryMode called with path:', directoryPath);
  set({ loading: true, error: null });

  try {
    console.log('[Directory] Initializing directory mode - DIRECTORY IS SOURCE OF TRUTH:', directoryPath);

    // Phase 1: ALWAYS load from directory first (source of truth)
    let directoryPrompts: Prompt[] = [];
    let directoryError: Error | null = null;

    // Force load from directory - this is the source of truth
    try {
      console.log('[DEBUG] FORCE LOADING from directory (source of truth):', directoryPath);
      directoryPrompts = await directoryStorage.readPromptsFromDirectory(directoryPath);
      console.log(`[DEBUG] Successfully loaded ${directoryPrompts.length} prompts from filesystem (SOURCE OF TRUTH)`);
    } catch (error) {
      directoryError = error as Error;
      console.error('[DEBUG] CRITICAL: Failed to load from directory (source of truth):', error);
    }

    // Phase 2: If directory loading failed, we cannot proceed
    if (directoryError) {
      const errorMsg = `Directory is not accessible: ${directoryError.message}. Directory must be accessible as the source of truth.`;
      console.error('[DEBUG] Directory access failed - cannot proceed:', errorMsg);
      throw new Error(errorMsg);
    }

    // Phase 3: IMMEDIATELY index FlexSearch and set state with directory data
    // This ensures search works instantly - don't wait for Turso backup
    console.log('[DEBUG] Final prompts from directory (source of truth):', directoryPrompts.length);
    indexPrompts(directoryPrompts);
    console.log('[DEBUG] FlexSearch index updated with directory data');

    console.log('[DEBUG] Setting state with directory prompts:', directoryPrompts.length);
    set({
      prompts: directoryPrompts,
      loading: false,
      directorySyncing: false
    });

    // Phase 4: Sync to Turso in background (non-blocking) - don't await this
    (async () => {
      try {
        console.log('[DEBUG] Loading from Turso for backup/sync purposes (background)...');
        const deviceId = getDeviceId();
        const user = await tursoQueries.getOrCreateUser(deviceId);
        const tursoPrompts = await tursoQueries.getPromptsByUserId(user.id, { includeArchived: true });
        console.log(`[DEBUG] Loaded ${tursoPrompts.length} prompts from Turso (backup only)`);

        // Sync directory prompts to Turso as backup
        for (const prompt of directoryPrompts) {
          try {
            await tursoQueries.createPrompt(user.id, {
              id: prompt.id,
              title: prompt.title,
              description: prompt.description,
              content: prompt.content,
              tags: prompt.tags,
              createdAt: prompt.createdAt,
              updatedAt: prompt.updatedAt,
            });
          } catch (syncError) {
            console.warn(`[Directory] Failed to sync prompt ${prompt.id} to Turso:`, syncError);
          }
        }
        console.log(`[Directory] Background sync to Turso complete`);
      } catch (error) {
        console.warn('[DEBUG] Failed to load/sync to Turso (continuing with directory only):', error);
      }
    })();

    // Phase 6: Setup directory watcher for real-time updates (after initial load is complete)
    if (!directoryError) {
      console.log('[Directory] Setting up file watcher for real-time updates...');
      await directoryStorage.watchDirectory(directoryPath, async (updatedPrompts) => {
        console.log('[Directory] Filesystem change detected - checking for actual changes');
        
        // Get current prompts to compare with updated prompts
        const currentPrompts = _get().prompts;
        
        // Check if prompts actually changed (avoid showing sync for no-op changes)
        const promptsChanged = !arePromptsEqual(currentPrompts, updatedPrompts);
        
        if (!promptsChanged) {
          console.log('[Directory] No actual changes detected, skipping sync update');
          return; // Don't show syncing indicator if no changes
        }
        
        console.log('[Directory] Actual changes detected, updating indices and state');

        // Update FlexSearch index synchronously with directory data
        indexPrompts(updatedPrompts);

        // Update state with directory data (source of truth)
        // Note: Don't show syncing indicator for file watching - only for explicit CRUD actions
        set({ prompts: updatedPrompts });
        
        // Sync directory changes to Turso in background (non-blocking)
        try {
          const deviceId = getDeviceId();
          const user = await tursoQueries.getOrCreateUser(deviceId);
          
          for (const prompt of updatedPrompts) {
            try {
              await tursoQueries.createPrompt(user.id, {
                id: prompt.id,
                title: prompt.title,
                description: prompt.description,
                content: prompt.content,
                tags: prompt.tags,
                createdAt: prompt.createdAt,
                updatedAt: prompt.updatedAt,
              });
            } catch (syncError) {
              console.warn(`[Directory] Failed to sync prompt ${prompt.id} to Turso:`, syncError);
            }
          }
          console.log(`[Directory] Synced ${updatedPrompts.length} directory prompts to Turso (backup)`);
        } catch (tursoError) {
          console.warn('[Directory] Failed to sync to Turso (continuing with directory only):', tursoError);
        }
      });
      console.log('[Directory] File watcher setup completed - directory is source of truth');
    }

    console.log('[DEBUG] Directory initialization completed successfully');
  } catch (error) {
    console.error('[DEBUG] Directory initialization failed:', error);
    set({
      prompts: [],
      loading: false,
      directorySyncing: false,
      error: error instanceof Error ? error.message : 'Failed to initialize directory mode',
    });
  }
}

async function addPromptToDirectory(
  set: SetState,
  get: GetState,
  promptData: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>,
  directoryPath: string
): Promise<boolean> {
  try {
    const now = Date.now();
    const prompt: Prompt = {
      id: directoryStorage.generatePromptId(),
      title: promptData.title,
      description: promptData.description,
      content: promptData.content,
      tags: promptData.tags,
      currentTxId: '',
      versions: [],
      createdAt: now,
      updatedAt: now,
      isArchived: false,
      isSynced: true,
    };

    // Write to filesystem
    const filePath = await directoryStorage.writePromptToDirectory(directoryPath, prompt);
    console.log('Created prompt file:', filePath);

    // Add to index and state
    addToIndex(prompt);
    set(state => ({ prompts: [prompt, ...state.prompts] }));

    // Notify if callback set
    const { onUploadStart } = get();
    if (onUploadStart) {
      onUploadStart(prompt.id, prompt.title);
    }

    // Sync to Turso in background (non-blocking)
    try {
      const deviceId = getDeviceId();
      const user = await tursoQueries.getOrCreateUser(deviceId);
      await tursoQueries.createPrompt(user.id, {
        id: prompt.id,
        title: prompt.title,
        description: prompt.description,
        content: prompt.content,
        tags: prompt.tags,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
      });
    } catch (tursoError) {
      console.warn('Failed to sync new prompt to Turso (continuing anyway):', tursoError);
    }

    return true;
  } catch (error) {
    console.error('Add prompt error (Directory):', error);
    set({ error: 'Failed to create prompt file' });
    return false;
  }
}

async function updatePromptInDirectory(
  set: SetState,
  get: GetState,
  id: string,
  updates: Partial<Prompt>,
  directoryPath: string
): Promise<boolean> {
  try {
    const state = get();
    const existingPrompt = state.prompts.find(p => p.id === id) as (Prompt & { _filePath?: string }) | undefined;
    if (!existingPrompt) {
      throw new Error('Prompt not found');
    }

    const updatedPrompt: Prompt = {
      ...existingPrompt,
      ...updates,
      updatedAt: Date.now(),
    };

    // Find the old file path if available, or search for it
    let oldFilePath = existingPrompt._filePath;
    if (!oldFilePath) {
      oldFilePath = await directoryStorage.findPromptFilePath(directoryPath, id) || undefined;
    }

    // Write to filesystem
    await directoryStorage.updatePromptInDirectory(directoryPath, updatedPrompt, oldFilePath);

    // Update index and state
    addToIndex(updatedPrompt);
    set(state => ({
      prompts: state.prompts.map(p => p.id === id ? updatedPrompt : p),
    }));

    // Sync to Turso in background (non-blocking)
    try {
      const deviceId = getDeviceId();
      const user = await tursoQueries.getOrCreateUser(deviceId);
      await tursoQueries.createPrompt(user.id, {
        id: updatedPrompt.id,
        title: updatedPrompt.title,
        description: updatedPrompt.description,
        content: updatedPrompt.content,
        tags: updatedPrompt.tags,
        createdAt: updatedPrompt.createdAt,
        updatedAt: updatedPrompt.updatedAt,
      });
    } catch (tursoError) {
      console.warn('Failed to sync updated prompt to Turso (continuing anyway):', tursoError);
    }

    return true;
  } catch (error) {
    console.error('Update prompt error (Directory):', error);
    set({ error: 'Failed to update prompt file' });
    return false;
  }
}

async function archivePromptInDirectory(
  set: SetState,
  get: GetState,
  id: string,
  directoryPath: string
): Promise<void> {
  const existingPrompt = get().prompts.find(p => p.id === id) as (Prompt & { _filePath?: string }) | undefined;
  if (!existingPrompt) return;

  const updatedPrompt: Prompt = {
    ...existingPrompt,
    isArchived: true,
    updatedAt: Date.now(),
  };

  // Find the file path
  let filePath = existingPrompt._filePath;
  if (!filePath) {
    filePath = await directoryStorage.findPromptFilePath(directoryPath, id) || undefined;
  }

  if (filePath) {
    try {
      // Update the file with archived flag
      await directoryStorage.updatePromptInDirectory(directoryPath, updatedPrompt, filePath);
    } catch (error) {
      console.error('Failed to archive prompt in directory:', error);
    }
  }

  // Update UI
  removeFromIndex(id);
  set(state => ({
    prompts: state.prompts.map(p =>
      p.id === id ? { ...p, isArchived: true } : p
    ),
  }));

  // Sync to Turso in background (non-blocking)
  try {
    const deviceId = getDeviceId();
    const user = await tursoQueries.getOrCreateUser(deviceId);
    await tursoQueries.createPrompt(user.id, {
      id: updatedPrompt.id,
      title: updatedPrompt.title,
      description: updatedPrompt.description,
      content: updatedPrompt.content,
      tags: updatedPrompt.tags,
      createdAt: updatedPrompt.createdAt,
      updatedAt: updatedPrompt.updatedAt,
    });
  } catch (tursoError) {
    console.warn('Failed to sync archived prompt to Turso (continuing anyway):', tursoError);
  }
}

async function restorePromptInDirectory(
  set: SetState,
  get: GetState,
  id: string,
  directoryPath: string
): Promise<void> {
  const existingPrompt = get().prompts.find(p => p.id === id) as (Prompt & { _filePath?: string }) | undefined;
  if (!existingPrompt) return;

  const updatedPrompt: Prompt = {
    ...existingPrompt,
    isArchived: false,
    updatedAt: Date.now(),
  };

  // Find the file path
  let filePath = existingPrompt._filePath;
  if (!filePath) {
    filePath = await directoryStorage.findPromptFilePath(directoryPath, id) || undefined;
  }

  if (filePath) {
    try {
      // Update the file with archived flag removed
      await directoryStorage.updatePromptInDirectory(directoryPath, updatedPrompt, filePath);
    } catch (error) {
      console.error('Failed to restore prompt in directory:', error);
    }
  }

  // Update UI
  addToIndex({ ...existingPrompt, isArchived: false });
  set(state => ({
    prompts: state.prompts.map(p =>
      p.id === id ? { ...p, isArchived: false } : p
    ),
  }));

  // Sync to Turso in background (non-blocking)
  try {
    const deviceId = getDeviceId();
    const user = await tursoQueries.getOrCreateUser(deviceId);
    await tursoQueries.createPrompt(user.id, {
      id: updatedPrompt.id,
      title: updatedPrompt.title,
      description: updatedPrompt.description,
      content: updatedPrompt.content,
      tags: updatedPrompt.tags,
      createdAt: updatedPrompt.createdAt,
      updatedAt: updatedPrompt.updatedAt,
    });
  } catch (tursoError) {
    console.warn('Failed to sync restored prompt to Turso (continuing anyway):', tursoError);
  }
}

async function deletePromptInDirectory(
  set: SetState,
  get: GetState,
  id: string,
  directoryPath: string
): Promise<void> {
  const existingPrompt = get().prompts.find(p => p.id === id) as (Prompt & { _filePath?: string }) | undefined;
  if (!existingPrompt) return;

  // Find the file path
  let filePath = existingPrompt._filePath;
  if (!filePath) {
    filePath = await directoryStorage.findPromptFilePath(directoryPath, id) || undefined;
  }

  if (filePath) {
    try {
      await directoryStorage.deletePromptFromDirectory(filePath);
    } catch (error) {
      console.error('Failed to delete prompt file:', error);
    }
  }

  // Update UI - remove from state entirely
  removeFromIndex(id);
  set(state => ({
    prompts: state.prompts.filter(p => p.id !== id),
  }));

  // Delete from Turso in background (non-blocking)
  try {
    const deviceId = getDeviceId();
    await tursoQueries.getOrCreateUser(deviceId);
    await tursoQueries.deletePrompt(existingPrompt.id);
  } catch (tursoError) {
    console.warn('Failed to delete prompt from Turso (continuing anyway):', tursoError);
  }
}

