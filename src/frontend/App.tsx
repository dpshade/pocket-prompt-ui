import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Plus, Archive as ArchiveIcon, Upload, Copy } from 'lucide-react';
import { WalletButton } from '@/frontend/components/wallet/WalletButton';
import { SearchBar, type SearchBarHandle } from '@/frontend/components/search/SearchBar';
import { PromptCard } from '@/frontend/components/prompts/PromptCard';
import { PromptListItem } from '@/frontend/components/prompts/PromptListItem';
import { PromptDialog } from '@/frontend/components/prompts/PromptDialog';
import { PromptEditor } from '@/frontend/components/prompts/PromptEditor';
import { VersionHistory } from '@/frontend/components/prompts/VersionHistory';
import { UploadDialog } from '@/frontend/components/shared/UploadDialog';
import { MobileMenu } from '@/frontend/components/shared/MobileMenu';
import { PasswordPrompt } from '@/frontend/components/wallet/PasswordPrompt';
import { PasswordUnlock } from '@/frontend/components/wallet/PasswordUnlock';
import { ThemeToggle } from '@/frontend/components/shared/ThemeToggle';
import { TeamsButton } from '@/frontend/components/waitlist/TeamsButton';
import { TeamsWaitlistModal } from '@/frontend/components/waitlist/TeamsWaitlistModal';
import { SyncButton } from '@/frontend/components/sync/SyncButton';
import { MigrationDialog } from '@/frontend/components/migration/MigrationDialog';
import { getMigrationStatus, type MigrationStatus } from '@/core/migration/arweave-to-turso';
import { PublicPromptView } from '@/frontend/components/prompts/PublicPromptView';
import { TursoSharedPromptView } from '@/frontend/components/prompts/TursoSharedPromptView';
import { Button } from '@/frontend/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/frontend/components/ui/tooltip';
import { useWallet } from '@/frontend/hooks/useWallet';
import { useIdentity } from '@/frontend/hooks/useIdentity';
import { usePrompts } from '@/frontend/hooks/usePrompts';
import { usePassword } from '@/frontend/contexts/PasswordContext';
import { FEATURE_FLAGS } from '@/shared/config/features';
import { useInitializeTheme } from '@/frontend/hooks/useTheme';
import { useCollections } from '@/frontend/hooks/useCollections';
import { getArweaveWallet } from '@/backend/api/client';
import type { Prompt, PromptVersion } from '@/shared/types/prompt';
import { searchPrompts } from '@/core/search';
import { evaluateExpression, expressionToString } from '@/core/search/boolean';
import type { FileImportResult } from '@/shared/utils/import';
import { getViewMode, saveViewMode, hasEncryptedPromptsInCache } from '@/core/storage/cache';
import type { EncryptedData } from '@/core/encryption/crypto';
import { wasPromptEncrypted } from '@/core/encryption/crypto';
import { findDuplicates } from '@/core/validation/duplicates';
import { parseDeepLink, updateDeepLink, urlParamToExpression } from '@/frontend/utils/deepLinks';

function App() {
  useInitializeTheme();

  // Initialize device identity for Turso mode
  const identity = useIdentity();

  // Auto-initialize identity when Turso is enabled
  useEffect(() => {
    if (FEATURE_FLAGS.TURSO_ENABLED && !identity.connected && !identity.connecting) {
      identity.initialize();
    }
  }, [identity]);

  // Check for public prompt viewing (txid parameter) - no wallet required
  const [publicTxId, setPublicTxId] = useState<string | null>(() => {
    const params = parseDeepLink();
    return params.txid || null;
  });

  // Check for Turso shared prompt viewing (share parameter) - no wallet required
  const [shareToken, setShareToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('share') || null;
  });

  const { address, connected: walletConnected } = useWallet();

  // Use identity connection for Turso, wallet for Arweave
  const connected = FEATURE_FLAGS.TURSO_ENABLED ? identity.connected : walletConnected;
  const { password, setPassword, hasPassword: hasPasswordFromContext, setWalletAddress, isLoadingPassword } = usePassword();

  // When encryption is disabled, treat as always having password
  const hasPassword = FEATURE_FLAGS.ENCRYPTION_ENABLED ? hasPasswordFromContext : true;

  // Update password context when wallet address changes
  useEffect(() => {
    setWalletAddress(address);
  }, [address, setWalletAddress]);
  const {
    prompts,
    loading,
    searchQuery,
    selectedTags,
    booleanExpression,
    activeSavedSearch,
    loadPrompts,
    addPrompt,
    updatePrompt,
    archivePrompt,
    restorePrompt,
    setSearchQuery,
    setBooleanExpression,
    loadSavedSearch,
  } = usePrompts();

  // Collections management with Arweave sync
  const arweaveWallet = getArweaveWallet();

  // Collection callbacks (no-op for Turso mode)
  const handleCollectionUploadStart = useCallback((_txId: string, _count: number) => {
    // No-op for Turso mode
  }, []);

  const handleCollectionUploadComplete = useCallback((_txId: string) => {
    // No-op for Turso mode
  }, []);

  const handleCollectionUploadError = useCallback((error: string) => {
    console.error('[App] Collections upload error:', error);
  }, []);

  const collections = useCollections(
    address,
    arweaveWallet,
    handleCollectionUploadStart,
    handleCollectionUploadComplete,
    handleCollectionUploadError
  );

  const [showArchived, setShowArchived] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(() => getViewMode());
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [passwordUnlockOpen, setPasswordUnlockOpen] = useState(false);
  const [sampleEncryptedData, setSampleEncryptedData] = useState<EncryptedData | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const searchBarRef = useRef<SearchBarHandle>(null);
  const [deepLinkInitialized, setDeepLinkInitialized] = useState(false);
  const previousIndexRef = useRef<number>(0);
  const passwordCheckDone = useRef(false);
  const [showFloatingNewButton, setShowFloatingNewButton] = useState(false);
  const [teamsWaitlistOpen, setTeamsWaitlistOpen] = useState(false);
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const migrationCheckDone = useRef(false);
  const newPromptButtonRef = useRef<HTMLButtonElement>(null);

  // Track grid columns for keyboard navigation
  const [gridColumns, setGridColumns] = useState(1);

  useEffect(() => {
    const updateGridColumns = () => {
      const width = window.innerWidth;
      if (width >= 1280) setGridColumns(4); // xl
      else if (width >= 1024) setGridColumns(3); // lg
      else if (width >= 640) setGridColumns(2); // sm
      else setGridColumns(1); // default
    };

    updateGridColumns();
    window.addEventListener('resize', updateGridColumns);
    return () => window.removeEventListener('resize', updateGridColumns);
  }, []);

  // Parse deep link parameters on initial load
  useEffect(() => {
    if (!connected || !hasPassword || deepLinkInitialized || prompts.length === 0) return;

    const params = parseDeepLink();

    // Apply search query
    if (params.q) {
      setSearchQuery(params.q);
    }

    // Apply boolean expression filter
    if (params.expr) {
      const expression = urlParamToExpression(params.expr);
      if (expression) {
        setBooleanExpression(expression, params.q);
      }
    }

    // Apply collection filter
    if (params.collection && collections.collections) {
      const savedSearch = collections.collections.find(
        (s: any) => s.id === params.collection
      );
      if (savedSearch) {
        loadSavedSearch(savedSearch);
      }
    }

    // Apply archived filter
    if (params.archived) {
      setShowArchived(true);
    }

    // Apply duplicates filter
    if (params.duplicates) {
      setShowDuplicates(true);
    }

    // Open specific prompt
    if (params.prompt) {
      const prompt = prompts.find(p => p.id === params.prompt);
      if (prompt) {
        setSelectedPrompt(prompt);
        setViewDialogOpen(true);
      }
    }

    setDeepLinkInitialized(true);
  }, [connected, hasPassword, deepLinkInitialized, prompts, collections.collections, setSearchQuery, setBooleanExpression, loadSavedSearch]);

  // Update URL when app state changes (debounced)
  useEffect(() => {
    if (!deepLinkInitialized) return;

    const timeoutId = setTimeout(() => {
      // If viewing a public prompt, use txid instead of prompt id
      let txidParam: string | undefined;
      if (viewDialogOpen && selectedPrompt && selectedPrompt.currentTxId) {
        const isPublic = !wasPromptEncrypted(selectedPrompt.tags);
        if (isPublic) {
          txidParam = selectedPrompt.currentTxId;
        }
      }

      updateDeepLink({
        q: searchQuery || undefined,
        expr: booleanExpression && !activeSavedSearch ? expressionToString(booleanExpression) : undefined,
        collection: activeSavedSearch?.id,
        // Don't include prompt param if we're using txid
        prompt: !txidParam && viewDialogOpen && selectedPrompt ? selectedPrompt.id : undefined,
        archived: showArchived || undefined,
        duplicates: showDuplicates || undefined,
        txid: txidParam,
      });
    }, 300); // Debounce for 300ms

    return () => clearTimeout(timeoutId);
  }, [searchQuery, booleanExpression, activeSavedSearch, viewDialogOpen, selectedPrompt, showArchived, showDuplicates, deepLinkInitialized]);

  // Blur search input when any dialog opens
  useEffect(() => {
    const anyDialogOpen = viewDialogOpen || editorOpen || versionHistoryOpen || uploadDialogOpen || passwordPromptOpen || passwordUnlockOpen;

    if (anyDialogOpen) {
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        activeElement.blur();
      }
    }
  }, [viewDialogOpen, editorOpen, versionHistoryOpen, uploadDialogOpen, passwordPromptOpen, passwordUnlockOpen]);

  const toggleViewMode = () => {
    const newMode = viewMode === 'list' ? 'cards' : 'list';
    setViewMode(newMode);
    saveViewMode(newMode);
  };

  // Reset password check when wallet disconnects
  useEffect(() => {
    if (!connected) {
      console.log('[App] Wallet disconnected, resetting password check flag');
      passwordCheckDone.current = false;
    }
  }, [connected]);

  // Close password dialogs if password becomes available
  useEffect(() => {
    if (hasPassword) {
      console.log('[App] Password available, closing any open password dialogs');
      setPasswordPromptOpen(false);
      setPasswordUnlockOpen(false);
      setSampleEncryptedData(null);
    }
  }, [hasPassword]);

  // Determine which password dialog to show when wallet connects
  useEffect(() => {
    const checkForEncryptedPrompts = async () => {
      // Skip password checks when encryption is disabled
      if (!FEATURE_FLAGS.ENCRYPTION_ENABLED) {
        console.log('[App] Encryption disabled, skipping password checks');
        passwordCheckDone.current = true;
        return;
      }

      console.log('[App] checkForEncryptedPrompts:', {
        connected,
        isLoadingPassword,
        hasPassword,
        passwordCheckDone: passwordCheckDone.current,
        address
      });

      // Wait for password loading to complete before checking
      if (!connected || isLoadingPassword) {
        console.log('[App] Skipping - not connected or still loading');
        return;
      }

      // Check localStorage SYNCHRONOUSLY to avoid race condition with PasswordContext
      // The PasswordContext useEffect might not have run yet, so we check directly
      if (address) {
        const storageKey = `pocket-prompt-encryption-key-${address}`;
        try {
          const storedPassword = localStorage.getItem(storageKey);
          if (storedPassword) {
            console.log('[App] Password found in localStorage, skipping dialog');
            passwordCheckDone.current = true;
            return;
          }
        } catch (err) {
          console.error('[App] Error checking localStorage:', err);
        }
      }

      // If password was loaded from storage (via React state), don't show dialog
      if (hasPassword) {
        console.log('[App] Password already loaded in state, marking check done');
        passwordCheckDone.current = true;
        return;
      }

      // Only check once per connection
      if (passwordCheckDone.current) {
        console.log('[App] Password check already done for this connection');
        return;
      }

      console.log('[App] No password found anywhere, checking for encrypted prompts...');
      passwordCheckDone.current = true;

      // Check if user has existing encrypted prompts
      const hasEncrypted = hasEncryptedPromptsInCache();

      if (hasEncrypted) {
        // Returning user - fetch one encrypted prompt for password validation
        console.log('[App] User has encrypted prompts, showing unlock dialog');

        // Get first encrypted prompt from cache
        const { getCachedPrompts } = await import('@/core/storage/cache');
        const cached = getCachedPrompts();
        const encryptedPrompt = Object.values(cached).find(p =>
          !p.tags.some(tag => tag.toLowerCase() === 'public')
        );

        if (encryptedPrompt) {
          // Fetch the encrypted content for password validation
          const { fetchPrompt } = await import('@/backend/api/client');
          const promptWithEncrypted = await fetchPrompt(
            encryptedPrompt.currentTxId,
            undefined,
            true // skipDecryption
          );

          if (promptWithEncrypted && typeof promptWithEncrypted.content === 'object') {
            setSampleEncryptedData(promptWithEncrypted.content);
            setPasswordUnlockOpen(true);
          } else {
            // Fallback to password prompt if we can't get encrypted data
            setPasswordPromptOpen(true);
          }
        } else {
          setPasswordPromptOpen(true);
        }
      } else {
        // New user - show password setup
        console.log('[App] New user, showing password setup dialog');
        setPasswordPromptOpen(true);
      }
    };

    checkForEncryptedPrompts();
  }, [connected, hasPassword, isLoadingPassword, address]);

  // Check for migration when using Turso
  useEffect(() => {
    if (!FEATURE_FLAGS.TURSO_ENABLED || !connected || migrationCheckDone.current) return;

    migrationCheckDone.current = true;
    const status = getMigrationStatus();
    setMigrationStatus(status);

    // Show migration dialog if:
    // - Has cached prompts
    // - Not already migrated
    // - Not already attempted (skipped)
    if (status.hasCachedPrompts && !status.alreadyMigrated && !status.migrationAttempted) {
      setMigrationDialogOpen(true);
    } else {
      // No migration needed, load prompts normally
      loadPrompts();
    }
  }, [connected, loadPrompts]);

  // Load prompts after password is set (Arweave mode)
  useEffect(() => {
    if (!FEATURE_FLAGS.TURSO_ENABLED && connected && hasPassword) {
      loadPrompts(password || undefined);
    }
  }, [connected, hasPassword, password, loadPrompts]);

  const handleMigrationComplete = () => {
    // Reload prompts from Turso after migration
    loadPrompts();
  };

  const handlePasswordSet = (newPassword: string) => {
    setPassword(newPassword);
    setPasswordPromptOpen(false);
  };

  const handlePasswordUnlock = (unlockedPassword: string) => {
    setPassword(unlockedPassword);
    setPasswordUnlockOpen(false);
    setSampleEncryptedData(null);
  };

  // Filter prompts based on search and tags (memoized for performance)
  const filteredPrompts = useMemo(() => {
    // Get search results with scores for sorting
    const searchResults = searchQuery ? searchPrompts(searchQuery) : [];
    const searchScoreMap = new Map(searchResults.map(r => [r.id, r.score]));

    // Pre-compute duplicate IDs once if needed
    const duplicateIds = showDuplicates
      ? new Set(findDuplicates(prompts).flatMap(group => group.prompts.map(p => p.id)))
      : null;

    return prompts
      .filter(prompt => {
        // Archive filter - mutually exclusive
        if (showArchived) {
          if (!prompt.isArchived) return false;
        } else {
          if (prompt.isArchived) return false;
        }

        // Duplicate filter
        if (duplicateIds && !duplicateIds.has(prompt.id)) return false;

        // Boolean expression filter (takes precedence over simple tag filter)
        if (booleanExpression) {
          if (!evaluateExpression(booleanExpression, prompt.tags)) return false;
        } else if (selectedTags.length > 0) {
          // Simple tag filter (only applies if no boolean expression)
          const hasAllTags = selectedTags.every(tag =>
            prompt.tags.some(t => t.toLowerCase() === tag.toLowerCase())
          );
          if (!hasAllTags) return false;
        }

        // Text search filter (works with both boolean and simple tag filters)
        if (searchQuery) {
          if (!searchScoreMap.has(prompt.id)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // When searching, sort by FlexSearch relevance score
        if (searchQuery && searchScoreMap.size > 0) {
          const scoreA = searchScoreMap.get(a.id) || 0;
          const scoreB = searchScoreMap.get(b.id) || 0;
          return scoreB - scoreA; // Higher score first
        }
        // Default sort by updatedAt (most recent first)
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [prompts, searchQuery, showArchived, showDuplicates, booleanExpression, selectedTags]);

  // Observe New Prompt button visibility to show floating version in header
  useEffect(() => {
    if (!newPromptButtonRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show floating button when original is not visible
        setShowFloatingNewButton(!entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: '-80px 0px 0px 0px', // Account for sticky header height
      }
    );

    observer.observe(newPromptButtonRef.current);

    return () => observer.disconnect();
  }, [filteredPrompts.length]);

  // Reset selected index when filtered prompts change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [filteredPrompts.length, searchQuery, selectedTags, booleanExpression, showArchived]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex === -1) return;

    const selectedElement = document.querySelector(`[data-prompt-index="${selectedIndex}"]`);
    if (selectedElement) {
      const previousIndex = previousIndexRef.current;
      const lastIndex = filteredPrompts.length - 1;

      // Detect wrap-around: jumped from last to first (navigating down)
      const wrappedDown = previousIndex === lastIndex && selectedIndex === 0;

      // Detect wrap-around: jumped from first to last (navigating up)
      const wrappedUp = previousIndex === 0 && selectedIndex === lastIndex;

      if (wrappedDown) {
        // Just wrapped from last to first - stay at top (already there from wrap)
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else if (wrappedUp || selectedIndex === lastIndex) {
        // Wrapped from first to last, or navigated to last element - scroll to bottom
        const maxScroll = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight
        );
        window.scrollTo({ top: maxScroll, behavior: 'instant' });
      } else if (selectedIndex === 0) {
        // At first element (not from wrap) - scroll to top
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else {
        // Otherwise, scroll element into view
        selectedElement.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      }

      // Update previous index for next comparison
      previousIndexRef.current = selectedIndex;
    }
  }, [selectedIndex, filteredPrompts.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Handle Escape to close dialogs
      if (event.key === 'Escape') {
        if (viewDialogOpen) {
          event.preventDefault();
          setViewDialogOpen(false);
          return;
        }
        if (editorOpen) {
          event.preventDefault();
          setEditorOpen(false);
          return;
        }
        if (versionHistoryOpen) {
          event.preventDefault();
          setVersionHistoryOpen(false);
          return;
        }
        if (uploadDialogOpen) {
          event.preventDefault();
          setUploadDialogOpen(false);
          return;
        }
        if (passwordPromptOpen) {
          event.preventDefault();
          setPasswordPromptOpen(false);
          return;
        }
        if (passwordUnlockOpen) {
          event.preventDefault();
          setPasswordUnlockOpen(false);
          return;
        }

        // Check if we're in the search input specifically
        const isSearchInput = target.getAttribute('type') === 'text' && target.getAttribute('placeholder')?.includes('Search');
        if (isSearchInput) {
          event.preventDefault();
          (target as HTMLInputElement).blur();
          return;
        }
      }

      const numResults = filteredPrompts.length;
      if (numResults === 0) return;

      // Check if we're in the search input specifically
      const isSearchInput = target.getAttribute('type') === 'text' && target.getAttribute('placeholder')?.includes('Search');

      // Block certain dialogs from all navigation
      const blockingDialogOpen = editorOpen || versionHistoryOpen || uploadDialogOpen || passwordPromptOpen || passwordUnlockOpen || viewDialogOpen;

      switch (event.key) {
        case 'ArrowDown':
          // Don't allow in any dialogs or when typing (except search)
          if (blockingDialogOpen) return;
          if (!isSearchInput && isTyping) return;
          event.preventDefault();
          // If in search input, check current selection
          if (isSearchInput) {
            // If nothing selected or middle item selected, go to last item
            if (selectedIndex === -1 || (selectedIndex !== 0 && selectedIndex !== numResults - 1)) {
              setSelectedIndex(numResults - 1);
            } else {
              // Otherwise go to first item
              setSelectedIndex(0);
            }
            searchBarRef.current?.blurSearchInput();
          } else if (viewMode === 'list') {
            // List view: go to next item (wrap around at the end)
            setSelectedIndex((prev) => (prev + 1) % numResults);
          } else {
            // Grid view: go down one row
            setSelectedIndex((prev) => {
              const next = prev + gridColumns;
              return next < numResults ? next : prev;
            });
          }
          break;
        case 'ArrowUp':
          // Don't allow in any dialogs or when typing (except search)
          if (blockingDialogOpen) return;
          if (!isSearchInput && isTyping) return;
          event.preventDefault();

          // If in search input, check current selection
          if (isSearchInput) {
            // If nothing selected or middle item selected, go to last item
            if (selectedIndex === -1 || (selectedIndex !== 0 && selectedIndex !== numResults - 1)) {
              setSelectedIndex(numResults - 1);
            } else {
              // Otherwise go to last item
              setSelectedIndex(numResults - 1);
            }
            searchBarRef.current?.blurSearchInput();
          } else if (viewMode === 'list') {
            // List view: if at top item (index 0), focus search input and unfocus results
            if (selectedIndex === 0) {
              searchBarRef.current?.focusSearchInput();
              setSelectedIndex(-1);
            } else {
              // Go to previous item
              setSelectedIndex((prev) => (prev - 1 + numResults) % numResults);
            }
          } else {
            // Grid view: if in top row, focus search input and unfocus results
            if (selectedIndex < gridColumns) {
              searchBarRef.current?.focusSearchInput();
              setSelectedIndex(-1);
            } else {
              // Go up one row
              setSelectedIndex((prev) => {
                const next = prev - gridColumns;
                return next >= 0 ? next : prev;
              });
            }
          }
          break;
        case 'ArrowLeft':
          // Only for grid view
          if (viewMode !== 'cards') return;
          if (blockingDialogOpen) return;
          if (!isSearchInput && isTyping) return;
          event.preventDefault();
          setSelectedIndex((prev) => {
            // Don't go left if we're at the first column
            const currentCol = prev % gridColumns;
            if (currentCol === 0) return prev;
            return prev - 1;
          });
          break;
        case 'ArrowRight':
          // Only for grid view
          if (viewMode !== 'cards') return;
          if (blockingDialogOpen) return;
          if (!isSearchInput && isTyping) return;
          event.preventDefault();
          setSelectedIndex((prev) => {
            // Don't go right if we're at the last column or last item
            const currentCol = prev % gridColumns;
            const isLastColumn = currentCol === gridColumns - 1;
            const isLastItem = prev === numResults - 1;
            if (isLastColumn || isLastItem) return prev;
            return prev + 1;
          });
          break;
        case 'Enter':
          // Don't allow in any dialogs
          if (blockingDialogOpen) return;
          if (!isSearchInput && isTyping) return;
          event.preventDefault();
          handleView(filteredPrompts[selectedIndex]);
          break;
        case 'e':
          // Don't allow when dialogs are open or typing - PromptDialog handles its own shortcuts
          if (blockingDialogOpen || isTyping) return;
          event.preventDefault();
          handleEdit(filteredPrompts[selectedIndex]);
          break;
        case 'c':
          // Don't allow when dialogs are open or typing - PromptDialog handles its own shortcuts
          if (blockingDialogOpen || isTyping) return;
          event.preventDefault();
          handleCopy(filteredPrompts[selectedIndex]);
          break;
        case 'a':
          // Don't allow when dialogs are open or typing - PromptDialog handles its own shortcuts
          if (blockingDialogOpen || isTyping) return;
          event.preventDefault();
          if (filteredPrompts[selectedIndex].isArchived) {
            restorePrompt(filteredPrompts[selectedIndex].id, password || undefined);
          } else {
            archivePrompt(filteredPrompts[selectedIndex].id, password || undefined);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredPrompts, selectedIndex, selectedPrompt, viewDialogOpen, editorOpen, versionHistoryOpen, uploadDialogOpen, passwordPromptOpen, passwordUnlockOpen, password, archivePrompt, restorePrompt, viewMode, gridColumns]);

  const handleCreateNew = () => {
    setEditingPrompt(null);
    setEditorOpen(true);
  };

  const handleView = (prompt: Prompt) => {
    // Open dialog immediately with cached data for instant response
    setSelectedPrompt(prompt);
    setViewDialogOpen(true);
  };

  const handleEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setEditorOpen(true);
    setViewDialogOpen(false);
  };

  const handleCopy = (prompt: Prompt) => {
    navigator.clipboard.writeText(prompt.content);
    setCopiedPromptId(prompt.id);
    // Keep overlay visible long enough for fade-out animation (1000ms visible + 300ms fade-out)
    setTimeout(() => setCopiedPromptId(null), 1300);
  };

  // Stable ID-based callbacks to prevent re-renders (fixes React.memo)
  const handleViewById = useCallback((id: string) => {
    const prompt = prompts.find(p => p.id === id);
    if (prompt) handleView(prompt);
  }, [prompts]);

  const handleEditById = useCallback((id: string) => {
    const prompt = prompts.find(p => p.id === id);
    if (prompt) handleEdit(prompt);
  }, [prompts]);

  const handleArchiveById = useCallback((id: string) => {
    archivePrompt(id, password || undefined);
  }, [archivePrompt, password]);

  const handleRestoreById = useCallback((id: string) => {
    restorePrompt(id, password || undefined);
  }, [restorePrompt, password]);

  const handleCopyById = useCallback((id: string) => {
    const prompt = prompts.find(p => p.id === id);
    if (prompt) handleCopy(prompt);
  }, [prompts]);

  const handleSave = async (data: Partial<Prompt>) => {
    if (editingPrompt) {
      return await updatePrompt(editingPrompt.id, data, password || undefined);
    } else {
      return await addPrompt(data as Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>, password || undefined);
    }
  };

  const handleRestoreVersion = async (version: PromptVersion) => {
    if (!selectedPrompt) return;

    // Fetch the old version and create a new version from it
    const oldPrompt = await import('@/backend/api/client').then(m => m.fetchPrompt(version.txId, password || undefined));
    if (oldPrompt) {
      await updatePrompt(selectedPrompt.id, {
        content: oldPrompt.content,
        title: oldPrompt.title,
        description: oldPrompt.description,
        tags: oldPrompt.tags,
      }, password || undefined);
    }
  };

  const handleExitPublicView = () => {
    setPublicTxId(null);
    const url = new URL(window.location.href);
    window.history.replaceState({}, '', url.pathname);
  };

  const handleExitSharedView = () => {
    setShareToken(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    window.history.replaceState({}, '', url.pathname + url.search);
  };

  const handleBatchImport = async (selectedPrompts: FileImportResult[]) => {
    let imported = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const result of selectedPrompts) {
      if (!result.success || !result.prompt) continue;

      try {
        const existingPrompt = prompts.find(p => p.id === result.prompt!.id);

        if (existingPrompt) {
          // Update existing prompt
          await updatePrompt(existingPrompt.id, {
            title: result.prompt!.title,
            description: result.prompt!.description,
            content: result.prompt!.content,
            tags: result.prompt!.tags,
          }, password || undefined);
          updated++;
        } else {
          // Add new prompt
          await addPrompt({
            title: result.prompt!.title,
            description: result.prompt!.description,
            content: result.prompt!.content,
            tags: result.prompt!.tags,
            currentTxId: '',
            versions: [],
            isArchived: false,
            isSynced: false,
          } as Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>, password || undefined);
          imported++;
        }
      } catch (err) {
        errors.push(`${result.fileName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Show summary
    let message = `Import Complete!\n\n`;
    if (imported > 0) {
      message += `✓ ${imported} new prompt${imported !== 1 ? 's' : ''} added\n`;
    }
    if (updated > 0) {
      message += `✓ ${updated} prompt${updated !== 1 ? 's' : ''} updated\n`;
    }
    if (errors.length > 0) {
      message += `\n⚠ ${errors.length} error${errors.length !== 1 ? 's' : ''}:\n`;
      message += errors.slice(0, 3).join('\n');
      if (errors.length > 3) {
        message += `\n... and ${errors.length - 3} more`;
      }
    }

    alert(message);
  };

  // Turso shared prompt view (no authentication required)
  if (shareToken && FEATURE_FLAGS.TURSO_ENABLED) {
    return <TursoSharedPromptView shareToken={shareToken} onBack={handleExitSharedView} />;
  }

  // Public prompt view (no wallet required) - for Arweave public prompts
  if (publicTxId) {
    return <PublicPromptView txId={publicTxId} onBack={handleExitPublicView} />;
  }

  if (!connected) {
    // Turso mode: show loading spinner while initializing
    if (FEATURE_FLAGS.TURSO_ENABLED) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-6 max-w-md">
            <div className="relative inline-block">
              <div className="animate-spin inline-block w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full" role="status">
                <span className="sr-only">Loading...</span>
              </div>
              <img src="/logo.svg" alt="Pocket Prompt Logo" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 animate-pulse" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold">Pocket Prompt</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Setting up your prompt library...
            </p>
          </div>
        </div>
      );
    }

    // Arweave mode: show wallet connect
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="animate-bounce-slow">
            <img src="/logo.svg" alt="Pocket Prompt Logo" className="h-16 w-16 sm:h-20 sm:w-20 mx-auto" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold">Pocket Prompt</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Your permanent, decentralized prompt library powered by Arweave.
            Connect your wallet to get started.
          </p>
          <WalletButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 pointer-events-none">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 pt-[calc(env(safe-area-inset-top)+0.85rem)]">
          <div className="border border-border bg-card rounded-lg px-5 sm:px-6 py-4 sm:py-4 flex items-center justify-between gap-3 shadow-md pointer-events-auto">
          <h1 className="flex items-center gap-2.5 sm:gap-2 text-lg font-bold sm:text-xl md:text-2xl">
            <img src="/logo.svg" alt="Pocket Prompt Logo" className="h-6 w-6 sm:h-6 sm:w-6" />
            <span className="sm:hidden">Pocket</span>
            <span className="hidden sm:inline">Pocket Prompt</span>
          </h1>

          <div className="flex items-center gap-2 sm:gap-2">
            {/* Desktop buttons - hidden on mobile */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setUploadDialogOpen(true)}
                    className="hidden sm:flex h-10 w-10 rounded-full"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Upload Files</p>
                </TooltipContent>
              </Tooltip>

            </TooltipProvider>

            {/* Sync button (desktop app only) */}
            {FEATURE_FLAGS.SHOW_SYNC_BUTTON && (
              <div className="hidden sm:block">
                <SyncButton />
              </div>
            )}

            {/* Teams/Packs waitlist button */}
            <div className="hidden sm:block">
              <TeamsButton onClick={() => setTeamsWaitlistOpen(true)} />
            </div>

            {/* Desktop theme toggle */}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>

            {FEATURE_FLAGS.WALLET_CONNECTION && (
              <WalletButton onSetPassword={() => setPasswordPromptOpen(true)} />
            )}

            {/* Mobile menu - shown only on mobile */}
            <MobileMenu
              onUploadClick={() => setUploadDialogOpen(true)}
            />
          </div>
        </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="space-y-2 px-4 pt-6 pb-[calc(11rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-10 sm:pb-12 lg:px-10">
        <section className="mx-auto flex max-w-6xl flex-col gap-4">
          {/* Desktop SearchBar - hidden on mobile */}
          <div className="hidden sm:block">
            <SearchBar
              ref={searchBarRef}
              showArchived={showArchived}
              setShowArchived={setShowArchived}
              viewMode={viewMode}
              onViewModeToggle={toggleViewMode}
              showDuplicates={showDuplicates}
              setShowDuplicates={setShowDuplicates}
              collections={collections}
            />
          </div>
          {showArchived && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm shadow-sm">
              <ArchiveIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Viewing archived prompts</span>
            </div>
          )}
          {showDuplicates && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-5 py-3 text-sm shadow-sm">
              <Copy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="font-medium text-amber-700 dark:text-amber-300">Showing potential duplicates only</span>
            </div>
          )}
        </section>

        <section className="mx-auto max-w-6xl">
        {loading ? (
          <div className="text-center py-12">
            <div className="relative inline-block">
              <div className="animate-spin inline-block w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full" role="status">
                <span className="sr-only">Loading...</span>
              </div>
              <img src="/logo.svg" alt="Pocket Prompt Logo" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 animate-pulse" />
            </div>
            <p className="mt-4 text-muted-foreground animate-pulse">Fetching your prompts...</p>
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground text-lg">
              {prompts.length === 0
                ? "No prompts yet. Click the + button to create your first prompt!"
                : 'No prompts match your search. Try different filters?'}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 ml-1 text-sm text-muted-foreground">
              Showing {filteredPrompts.length} {filteredPrompts.length === 1 ? 'prompt' : 'prompts'}
              {(() => {
                const totalActive = prompts.filter(p => !p.isArchived).length;
                return filteredPrompts.length !== totalActive && !showArchived ? ` of ${totalActive} total` : '';
              })()}
            </div>
            {viewMode === 'list' || window.innerWidth < 640 ? (
          <div className="border border-border bg-card rounded-lg overflow-hidden">
            {filteredPrompts.map((prompt, index) => (
              <PromptListItem
                key={prompt.id}
                prompt={prompt}
                isCopied={copiedPromptId === prompt.id}
                onView={handleViewById}
                onEdit={handleEditById}
                onArchive={handleArchiveById}
                onRestore={handleRestoreById}
                onCopyPrompt={handleCopyById}
                variant="pane"
                data-prompt-index={index}
                data-selected={index === selectedIndex}
              />
            ))}
          </div>
        ) : (
          <div className="hidden sm:grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredPrompts.map((prompt, index) => (
              <div key={prompt.id} data-prompt-index={index} data-selected={index === selectedIndex}>
                <PromptCard
                  prompt={prompt}
                  isCopied={copiedPromptId === prompt.id}
                  onView={handleViewById}
                  onEdit={handleEditById}
                  onArchive={handleArchiveById}
                  onRestore={handleRestoreById}
                  onCopyPrompt={handleCopyById}
                />
              </div>
            ))}
          </div>
        )}
          </>
        )}
        </section>
      </main>

      {/* Floating Search Bar - Mobile only */}
      <div className="pointer-events-none sm:hidden">
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <div className="pointer-events-auto w-full max-w-2xl">
            <SearchBar
              showArchived={showArchived}
              setShowArchived={setShowArchived}
              viewMode={viewMode}
              onViewModeToggle={toggleViewMode}
              showDuplicates={showDuplicates}
              setShowDuplicates={setShowDuplicates}
              collections={collections}
              showNewPromptButton={showFloatingNewButton}
              onCreateNew={handleCreateNew}
            />
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <Button
        onClick={handleCreateNew}
        size="lg"
        className="fixed bottom-6 right-6 sm:bottom-6 sm:right-6 rounded-full shadow-xl hover:shadow-2xl transition-all hover:scale-110 active:scale-95 z-50 h-16 w-16 sm:h-14 sm:w-14 md:h-12 md:w-auto md:px-6 flex items-center justify-center"
        title="Create prompt"
      >
        <Plus className="h-7 w-7 sm:h-6 sm:w-6 md:mr-2 flex-shrink-0" />
        <span className="hidden md:inline font-semibold">Prompt</span>
      </Button>

      {/* Dialogs */}
      <PromptDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        prompt={selectedPrompt}
        onEdit={() => handleEdit(selectedPrompt!)}
        onArchive={() => archivePrompt(selectedPrompt!.id, password || undefined)}
        onShowVersions={() => {
          setViewDialogOpen(false);
          setVersionHistoryOpen(true);
        }}
      />

      <PromptEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        prompt={editingPrompt}
        onSave={handleSave}
      />

      <VersionHistory
        open={versionHistoryOpen}
        onOpenChange={setVersionHistoryOpen}
        prompt={selectedPrompt}
        onRestoreVersion={handleRestoreVersion}
        password={password || undefined}
      />

      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onImport={handleBatchImport}
        existingPromptIds={prompts.map(p => p.id)}
        existingPrompts={prompts}
      />

      <PasswordPrompt
        open={passwordPromptOpen}
        onPasswordSet={handlePasswordSet}
        onCancel={() => setPasswordPromptOpen(false)}
      />

      <PasswordUnlock
        open={passwordUnlockOpen}
        sampleEncryptedData={sampleEncryptedData}
        onPasswordUnlock={handlePasswordUnlock}
        onCancel={() => setPasswordUnlockOpen(false)}
      />

      <TeamsWaitlistModal
        open={teamsWaitlistOpen}
        onOpenChange={setTeamsWaitlistOpen}
      />

      {migrationStatus && (
        <MigrationDialog
          open={migrationDialogOpen}
          onOpenChange={setMigrationDialogOpen}
          status={migrationStatus}
          onComplete={handleMigrationComplete}
        />
      )}
    </div>
  );
}

export default App;