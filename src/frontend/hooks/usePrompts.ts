import { create } from 'zustand';
import type { Prompt, PromptMetadata, BooleanExpression, SavedSearch } from '@/shared/types/prompt';
import { getCachedPrompts, cachePrompt, addPromptToProfile, archivePrompt as archivePromptStorage, restorePrompt as restorePromptStorage, getAttachedDirectory, setAttachedDirectory as saveAttachedDirectory, isDirectoryMode } from '@/core/storage/cache';
import { indexPrompts, addToIndex, removeFromIndex } from '@/core/search';
import { getDeviceId } from '@/core/identity/device';
import * as tursoQueries from '@/backend/api/turso-queries';
import * as directoryStorage from '@/backend/api/directory-storage';

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

  // Directory mode state
  directoryMode: boolean;
  attachedDirectory: string | null;
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

  // Directory mode methods
  attachDirectory: () => Promise<string | null>;
  detachDirectory: () => void;
  resetAllData: () => Promise<void>;
  set: (state: Partial<PromptsState>) => void;
}

export const usePrompts = create<PromptsState>((set, get) => ({
  prompts: [],
  loading: false,
  error: null,
  searchQuery: '',
  selectedTags: [],
  booleanExpression: null,
  activeSavedSearch: null,
  onUploadStart: undefined,
  onUploadComplete: undefined,

  // Initialize directory mode from stored state
  directoryMode: isDirectoryMode(),
  attachedDirectory: getAttachedDirectory(),
  directorySyncing: false,

  loadPrompts: async (_password?: string) => {
    const state = get();
    if (state.directoryMode && state.attachedDirectory) {
      return loadPromptsFromDirectory(set, get, state.attachedDirectory);
    }
    return loadPromptsFromTurso(set, get);
  },

  addPrompt: async (promptData, _password?: string) => {
    const state = get();
    if (state.directoryMode && state.attachedDirectory) {
      return addPromptToDirectory(set, get, promptData, state.attachedDirectory);
    }
    return addPromptToTurso(set, get, promptData);
  },

  updatePrompt: async (id, updates, _password?: string) => {
    const state = get();
    if (state.directoryMode && state.attachedDirectory) {
      return updatePromptInDirectory(set, get, id, updates, state.attachedDirectory);
    }
    return updatePromptInTurso(set, get, id, updates);
  },

  archivePrompt: async (id, _password?: string) => {
    const state = get();
    if (state.directoryMode && state.attachedDirectory) {
      return archivePromptInDirectory(set, get, id, state.attachedDirectory);
    }
    return archivePromptInTurso(set, get, id);
  },

  restorePrompt: async (id, _password?: string) => {
    const state = get();
    if (state.directoryMode && state.attachedDirectory) {
      return restorePromptInDirectory(set, get, id, state.attachedDirectory);
    }
    return restorePromptInTurso(set, get, id);
  },

  deletePrompt: async (id) => {
    const state = get();
    if (state.directoryMode && state.attachedDirectory) {
      return deletePromptInDirectory(set, get, id, state.attachedDirectory);
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

  attachDirectory: async () => {
    try {
      const path = await directoryStorage.selectDirectory();
      if (!path) return null;

      // Save the path and switch to directory mode
      saveAttachedDirectory(path);
      set({
        directoryMode: true,
        attachedDirectory: path,
        prompts: [],
        loading: true,
        error: null,
      });

      // Load prompts from the directory
      const prompts = await directoryStorage.readPromptsFromDirectory(path);
      indexPrompts(prompts);

      // Set prompts immediately so user sees them
      set({ prompts, loading: false });

      // Start watching for changes (non-blocking, failures are ok)
      try {
        await directoryStorage.watchDirectory(path, async (updatedPrompts) => {
          set({ directorySyncing: true });
          indexPrompts(updatedPrompts);
          set({ prompts: updatedPrompts, directorySyncing: false });
          
          // Sync to Turso in background (non-blocking)
          try {
            const deviceId = getDeviceId();
            const user = await tursoQueries.getOrCreateUser(deviceId);
            
            // Sync each prompt to Turso
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
                console.warn(`Failed to sync prompt ${prompt.id} to Turso:`, syncError);
              }
            }
          } catch (tursoError) {
            console.warn('Failed to sync to Turso (continuing anyway):', tursoError);
          }
        });
      } catch (watchError) {
        console.warn('File watching not available:', watchError);
        // Continue without watching - user can manually refresh
      }

      return path;
    } catch (error) {
      console.error('Failed to attach directory:', error);
      // Reset to non-directory mode on error
      saveAttachedDirectory(null);
      set({
        directoryMode: false,
        attachedDirectory: null,
        error: 'Failed to attach directory',
        loading: false
      });
      return null;
    }
  },

  detachDirectory: () => {
    // Stop watching
    directoryStorage.stopWatching();

    // Clear the stored path
    saveAttachedDirectory(null);

    // Switch back to database mode
    set({
      directoryMode: false,
      attachedDirectory: null,
      prompts: [],
    });
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

    // Detach directory if attached
    if (get().attachedDirectory) {
      get().detachDirectory();
    }

    // Reload prompts (will be empty)
    await get().loadPrompts();
  },

  set: (state) => set(state),
}));

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

async function loadPromptsFromDirectory(
  set: SetState,
  _get: GetState,
  directoryPath: string
): Promise<void> {
  set({ loading: true, error: null });

  try {
    console.log('Loading prompts from directory:', directoryPath);

    const prompts = await directoryStorage.readPromptsFromDirectory(directoryPath);

    console.log(`Loaded ${prompts.length} prompts from directory`);

    // Index for search
    indexPrompts(prompts);

    // Start watching for changes
    await directoryStorage.watchDirectory(directoryPath, (updatedPrompts) => {
      console.log('[Directory] Detected change, reloading prompts');
      indexPrompts(updatedPrompts);
      set({ prompts: updatedPrompts });
    });

    set({ prompts, loading: false });
  } catch (error) {
    console.error('Load prompts error (Directory):', error);
    set({
      prompts: [],
      loading: false,
      error: 'Failed to read directory. Check if the path is valid.',
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

