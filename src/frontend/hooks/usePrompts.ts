import { create } from 'zustand';
import type { Prompt, PromptMetadata, BooleanExpression, SavedSearch } from '@/shared/types/prompt';
import { getCachedPrompts, cachePrompt, addPromptToProfile, archivePrompt as archivePromptStorage, restorePrompt as restorePromptStorage } from '@/core/storage/cache';
import { indexPrompts, addToIndex, removeFromIndex } from '@/core/search';
import { FEATURE_FLAGS } from '@/shared/config/features';
import { getDeviceId } from '@/core/identity/device';
import { isTursoConfigured } from '@/backend/api/turso';
import * as tursoQueries from '@/backend/api/turso-queries';

// Legacy imports for Arweave mode (when enabled)
import { fetchPrompt, uploadPrompt, getWalletJWK, getWalletAddress, queryAllUserPrompts, updatePromptArchiveStatus } from '@/backend/api/client';

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

  loadPrompts: (password?: string) => Promise<void>;
  addPrompt: (prompt: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>, password?: string) => Promise<boolean>;
  updatePrompt: (id: string, updates: Partial<Prompt>, password?: string) => Promise<boolean>;
  archivePrompt: (id: string, password?: string) => Promise<void>;
  restorePrompt: (id: string, password?: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  toggleTag: (tag: string) => void;
  clearFilters: () => void;
  setBooleanExpression: (expression: BooleanExpression | null, textQuery?: string) => void;
  loadSavedSearch: (search: SavedSearch) => void;
  clearBooleanSearch: () => void;
  setUploadCallbacks: (onStart?: UploadStartCallback, onComplete?: UploadCompleteCallback) => void;
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

  loadPrompts: async (password?: string) => {
    // Use Turso backend when enabled
    if (FEATURE_FLAGS.TURSO_ENABLED && isTursoConfigured()) {
      return loadPromptsFromTurso(set, get);
    }

    // Fall back to Arweave when Turso is disabled
    return loadPromptsFromArweave(set, get, password);
  },

  addPrompt: async (promptData, password?: string) => {
    // Use Turso backend when enabled
    if (FEATURE_FLAGS.TURSO_ENABLED && isTursoConfigured()) {
      return addPromptToTurso(set, get, promptData);
    }

    // Fall back to Arweave when Turso is disabled
    return addPromptToArweave(set, get, promptData, password);
  },

  updatePrompt: async (id, updates, password?: string) => {
    // Use Turso backend when enabled
    if (FEATURE_FLAGS.TURSO_ENABLED && isTursoConfigured()) {
      return updatePromptInTurso(set, get, id, updates);
    }

    // Fall back to Arweave when Turso is disabled
    return updatePromptInArweave(set, get, id, updates, password);
  },

  archivePrompt: async (id, password?: string) => {
    // Use Turso backend when enabled
    if (FEATURE_FLAGS.TURSO_ENABLED && isTursoConfigured()) {
      return archivePromptInTurso(set, get, id);
    }

    // Fall back to Arweave when Turso is disabled
    return archivePromptInArweave(set, get, id, password);
  },

  restorePrompt: async (id, password?: string) => {
    // Use Turso backend when enabled
    if (FEATURE_FLAGS.TURSO_ENABLED && isTursoConfigured()) {
      return restorePromptInTurso(set, get, id);
    }

    // Fall back to Arweave when Turso is disabled
    return restorePromptInArweave(set, get, id, password);
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
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
    set({
      booleanExpression: expression,
      searchQuery: textQuery || '',
      selectedTags: [], // Clear simple tag filters when using boolean
      activeSavedSearch: null, // Clear active saved search if manually setting expression
    });
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
// Arweave Backend Implementation (Legacy - when ARWEAVE_ENABLED)
// =============================================================================

async function loadPromptsFromArweave(set: SetState, _get: GetState, password?: string): Promise<void> {
  set({ loading: true, error: null });
  try {
    // Get wallet address for GraphQL query
    const walletAddress = await getWalletAddress();
    if (!walletAddress) {
      console.warn('No wallet connected, loading from cache only');
      const cached = getCachedPrompts();
      const cachedPrompts = Object.values(cached);
      indexPrompts(cachedPrompts);
      set({ prompts: cachedPrompts, loading: false });
      return;
    }

    console.log('Discovering prompts for wallet:', walletAddress);

    // Query all user's prompts from Arweave via GraphQL
    const discoveredTxIds = await queryAllUserPrompts(walletAddress);
    console.log(`Discovered ${discoveredTxIds.length} prompts via GraphQL`);

    if (discoveredTxIds.length === 0) {
      set({ prompts: [], loading: false });
      return;
    }

    const cached = getCachedPrompts();
    const cachedPrompts: Prompt[] = [];
    const toFetch: string[] = [];

    // Check what we have cached
    discoveredTxIds.forEach(txId => {
      const cachedPrompt = Object.values(cached).find(p =>
        p.currentTxId === txId || p.versions.some(v => v.txId === txId)
      );

      if (cachedPrompt) {
        cachedPrompts.push(cachedPrompt);
      } else {
        toFetch.push(txId);
      }
    });

    console.log(`Found ${cachedPrompts.length} in cache, fetching ${toFetch.length} from Arweave`);

    // Fetch missing prompts from Arweave in parallel
    if (toFetch.length > 0) {
      const fetched = await Promise.all(
        toFetch.map(txId => fetchPrompt(txId, password))
      );

      fetched.forEach(prompt => {
        if (prompt) {
          cachePrompt(prompt);
          cachedPrompts.push(prompt);

          const metadata: PromptMetadata = {
            id: prompt.id,
            title: prompt.title,
            tags: prompt.tags,
            currentTxId: prompt.currentTxId,
            updatedAt: prompt.updatedAt,
            isArchived: prompt.isArchived || false,
          };
          addPromptToProfile(metadata);
        }
      });
    }

    indexPrompts(cachedPrompts);
    set({ prompts: cachedPrompts, loading: false });
  } catch (error) {
    console.error('Load prompts error:', error);
    set({ error: 'Failed to load prompts', loading: false });
  }
}

async function addPromptToArweave(
  set: SetState,
  get: GetState,
  promptData: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>,
  password?: string
): Promise<boolean> {
  try {
    const jwk = await getWalletJWK();

    const prompt: Prompt = {
      ...promptData,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      currentTxId: '',
      versions: [],
      isArchived: false,
      isSynced: false,
    };

    const result = await uploadPrompt(prompt, jwk, password);
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    const { onUploadStart } = get();
    if (onUploadStart) {
      onUploadStart(result.id, prompt.title);
    }

    prompt.currentTxId = result.id;
    prompt.versions = [{
      txId: result.id,
      version: 1,
      timestamp: Date.now(),
    }];
    prompt.isSynced = true;

    cachePrompt(prompt);
    const metadata: PromptMetadata = {
      id: prompt.id,
      title: prompt.title,
      tags: prompt.tags,
      currentTxId: prompt.currentTxId,
      updatedAt: prompt.updatedAt,
      isArchived: false,
    };
    addPromptToProfile(metadata);

    addToIndex(prompt);
    set(state => ({ prompts: [prompt, ...state.prompts] }));

    return true;
  } catch (error) {
    console.error('Add prompt error:', error);
    set({ error: 'Failed to create prompt' });
    return false;
  }
}

async function updatePromptInArweave(
  set: SetState,
  get: GetState,
  id: string,
  updates: Partial<Prompt>,
  password?: string
): Promise<boolean> {
  try {
    const state = get();
    const existingPrompt = state.prompts.find(p => p.id === id);
    if (!existingPrompt) {
      throw new Error('Prompt not found');
    }

    const jwk = await getWalletJWK();

    // Fetch fresh version history from Arweave before updating
    let freshPrompt = existingPrompt;
    if (existingPrompt.currentTxId) {
      const fetched = await fetchPrompt(existingPrompt.currentTxId, password);
      if (fetched) {
        freshPrompt = fetched;
      }
    }

    const updatedPrompt: Prompt = {
      ...freshPrompt,
      ...updates,
      updatedAt: Date.now(),
    };

    const result = await uploadPrompt(updatedPrompt, jwk, password);
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    const { onUploadStart } = get();
    if (onUploadStart) {
      onUploadStart(result.id, updatedPrompt.title);
    }

    updatedPrompt.currentTxId = result.id;
    const existingVersions = freshPrompt.versions && freshPrompt.versions.length > 0
      ? freshPrompt.versions
      : [{
          txId: freshPrompt.currentTxId || '',
          version: 1,
          timestamp: freshPrompt.createdAt || Date.now(),
        }];

    const nextVersion = Math.max(...existingVersions.map(v => v.version || 1)) + 1;
    updatedPrompt.versions = [
      ...existingVersions,
      {
        txId: result.id,
        version: nextVersion,
        timestamp: Date.now(),
        changeNote: updates.content ? 'Content updated' : 'Metadata updated',
      },
    ];
    updatedPrompt.isSynced = true;

    cachePrompt(updatedPrompt);
    const metadata: PromptMetadata = {
      id: updatedPrompt.id,
      title: updatedPrompt.title,
      tags: updatedPrompt.tags,
      currentTxId: updatedPrompt.currentTxId,
      updatedAt: updatedPrompt.updatedAt,
      isArchived: updatedPrompt.isArchived,
    };
    addPromptToProfile(metadata);

    addToIndex(updatedPrompt);
    set(state => ({
      prompts: state.prompts.map(p => p.id === id ? updatedPrompt : p),
    }));

    return true;
  } catch (error) {
    console.error('Update prompt error:', error);
    set({ error: 'Failed to update prompt' });
    return false;
  }
}

async function archivePromptInArweave(
  set: SetState,
  get: GetState,
  id: string,
  password?: string
): Promise<void> {
  const prompt = get().prompts.find(p => p.id === id);
  if (!prompt) return;

  // Optimistically update UI immediately
  archivePromptStorage(id);
  removeFromIndex(id);
  set(state => ({
    prompts: state.prompts.map(p =>
      p.id === id ? { ...p, isArchived: true } : p
    ),
  }));

  // Upload to Arweave in background
  try {
    const jwk = await getWalletJWK();
    const result = await updatePromptArchiveStatus(prompt, true, jwk, password);

    if (result.success) {
      const { onUploadStart } = get();
      if (onUploadStart) {
        onUploadStart(result.id, `${prompt.title} (archived)`);
      }

      const currentVersion = prompt.versions.length > 0
        ? Math.max(...prompt.versions.map(v => v.version || 1))
        : 1;
      const updatedPrompt: Prompt = {
        ...prompt,
        isArchived: true,
        currentTxId: result.id,
        versions: [
          ...prompt.versions,
          {
            txId: result.id,
            version: currentVersion,
            timestamp: Date.now(),
            changeNote: 'Archived',
          },
        ],
        isSynced: true,
      };

      cachePrompt(updatedPrompt);
      const metadata: PromptMetadata = {
        id: updatedPrompt.id,
        title: updatedPrompt.title,
        tags: updatedPrompt.tags,
        currentTxId: updatedPrompt.currentTxId,
        updatedAt: updatedPrompt.updatedAt,
        isArchived: true,
      };
      addPromptToProfile(metadata);

      set(state => ({
        prompts: state.prompts.map(p =>
          p.id === id ? updatedPrompt : p
        ),
      }));
    }
  } catch (error) {
    console.error('Failed to archive prompt on Arweave:', error);
  }
}

async function restorePromptInArweave(
  set: SetState,
  get: GetState,
  id: string,
  password?: string
): Promise<void> {
  const prompt = get().prompts.find(p => p.id === id);
  if (!prompt) return;

  // Optimistically update UI immediately
  restorePromptStorage(id);
  if (prompt) {
    addToIndex({ ...prompt, isArchived: false });
  }
  set(state => ({
    prompts: state.prompts.map(p =>
      p.id === id ? { ...p, isArchived: false } : p
    ),
  }));

  // Upload to Arweave in background
  try {
    const jwk = await getWalletJWK();
    const result = await updatePromptArchiveStatus(prompt, false, jwk, password);

    if (result.success) {
      const { onUploadStart } = get();
      if (onUploadStart) {
        onUploadStart(result.id, `${prompt.title} (restored)`);
      }

      const currentVersion = prompt.versions.length > 0
        ? Math.max(...prompt.versions.map(v => v.version || 1))
        : 1;
      const updatedPrompt: Prompt = {
        ...prompt,
        isArchived: false,
        currentTxId: result.id,
        versions: [
          ...prompt.versions,
          {
            txId: result.id,
            version: currentVersion,
            timestamp: Date.now(),
            changeNote: 'Restored from archive',
          },
        ],
        isSynced: true,
      };

      cachePrompt(updatedPrompt);
      const metadata: PromptMetadata = {
        id: updatedPrompt.id,
        title: updatedPrompt.title,
        tags: updatedPrompt.tags,
        currentTxId: updatedPrompt.currentTxId,
        updatedAt: updatedPrompt.updatedAt,
        isArchived: false,
      };
      addPromptToProfile(metadata);

      set(state => ({
        prompts: state.prompts.map(p =>
          p.id === id ? updatedPrompt : p
        ),
      }));
    }
  } catch (error) {
    console.error('Failed to restore prompt on Arweave:', error);
  }
}
