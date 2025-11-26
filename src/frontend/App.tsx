import { useEffect, useState, useCallback, useRef, useMemo, useDeferredValue } from 'react';
import { Plus, Archive as ArchiveIcon, Download, Copy } from 'lucide-react';
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
import { HotkeysDialog } from '@/frontend/components/shared/HotkeysDialog';
import { TeamsButton } from '@/frontend/components/waitlist/TeamsButton';
import { TeamsWaitlistModal } from '@/frontend/components/waitlist/TeamsWaitlistModal';
import { SyncButton } from '@/frontend/components/sync/SyncButton';
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
import type { Prompt, PromptVersion } from '@/shared/types/prompt';
import { searchPrompts } from '@/core/search';
import { evaluateExpression, expressionToString } from '@/core/search/boolean';
import type { FileImportResult } from '@/shared/utils/import';
import { getViewMode, saveViewMode, hasEncryptedPromptsInCache } from '@/core/storage/cache';
import type { EncryptedData } from '@/core/encryption/crypto';
import { wasPromptEncrypted } from '@/core/encryption/crypto';
import { findDuplicates } from '@/core/validation/duplicates';
import { parseDeepLink, updateDeepLink, urlParamToExpression } from '@/frontend/utils/deepLinks';
import { parseProtocolUrl, isTauri, type ProtocolLinkParams } from '@/frontend/utils/protocolLinks';


function App() {
  useInitializeTheme();

  // Initialize device identity for Turso mode
  const identity = useIdentity();

  // Auto-initialize identity for local-first mode
  useEffect(() => {
    if (!identity.connected && !identity.connecting) {
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

  const { address } = useWallet();

  // Use identity connection for local-first mode
  const connected = identity.connected;
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

  // Defer searchQuery for filtering - keeps input responsive while filtering happens in background
  // EXCEPT for clearing: when searchQuery is empty, use it directly for instant clear
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const effectiveSearchQuery = searchQuery === '' ? '' : deferredSearchQuery;

  // Collections management (localStorage only)
  const collections = useCollections();

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
  const desktopSearchBarContainerRef = useRef<HTMLDivElement>(null);
  const [isSearchBarVisible, setIsSearchBarVisible] = useState(true);
  const [deepLinkInitialized, setDeepLinkInitialized] = useState(false);
  const previousIndexRef = useRef<number>(0);
  const passwordCheckDone = useRef(false);
  const [showFloatingNewButton, setShowFloatingNewButton] = useState(false);
  const [teamsWaitlistOpen, setTeamsWaitlistOpen] = useState(false);
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
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

  // Helper function to apply protocol link params (used by Tauri deep links)
  // Use ref to avoid recreating listener when dependencies change
  const applyProtocolLinkParamsRef = useRef<(params: ProtocolLinkParams, source?: string) => void>(() => {});
  // Store pending deep link params when app state isn't ready yet
  const pendingDeepLinkRef = useRef<ProtocolLinkParams | null>(null);
  // Retry mechanism for failed deep link applications
  const deepLinkRetryRef = useRef<{
    attempts: number;
    maxAttempts: number;
    lastAttempt: number;
    params: ProtocolLinkParams | null;
  }>({
    attempts: 0,
    maxAttempts: 3,
    lastAttempt: 0,
    params: null
  });
  // Track deep link processing state for debugging
  const deepLinkStateRef = useRef<{
    totalReceived: number;
    totalApplied: number;
    totalPending: number;
    totalFailed: number;
    lastReceived: string | null;
    lastApplied: string | null;
    sources: Record<string, number>;
  }>({
    totalReceived: 0,
    totalApplied: 0,
    totalPending: 0,
    totalFailed: 0,
    lastReceived: null,
    lastApplied: null,
    sources: {}
  });

  // Actual implementation of applying deep link params
  const actuallyApplyParams = useCallback((params: ProtocolLinkParams, source = 'unknown') => {
    console.log('[App] Actually applying protocol link params:', params, 'source:', source);
    console.log('[App] Current app state before applying:', {
      connected,
      hasPassword,
      promptsLength: prompts.length,
      searchQuery,
      booleanExpression,
      showArchived,
      showDuplicates
    });
    
    // Update tracking state
    deepLinkStateRef.current.totalApplied++;
    deepLinkStateRef.current.lastApplied = new Date().toISOString();
    deepLinkStateRef.current.sources[source] = (deepLinkStateRef.current.sources[source] || 0) + 1;
    
    console.log('[App] Deep link state updated:', deepLinkStateRef.current);
    
    try {

    switch (params.type) {
      case 'prompt':
        if (params.id) {
          const prompt = prompts.find(p => p.id === params.id);
          if (prompt) {
            setSelectedPrompt(prompt);
            setViewDialogOpen(true);
          }
          if (params.archived) setShowArchived(true);
        }
        break;

      case 'collection':
        if (params.id && collections.collections) {
          const savedSearch = collections.collections.find((s: any) => s.id === params.id);
          if (savedSearch) {
            loadSavedSearch(savedSearch);
          }
        }
        break;

      case 'search':
        console.log('[App] Handling search params:', {
          query: params.query,
          expression: params.expression,
          archived: params.archived,
          duplicates: params.duplicates
        });
        
        // Validate search parameters before application
        if (params.query) {
          console.log('[App] Applying search query:', params.query);
          console.log('[App] Before setSearchQuery - current query:', searchQuery);
          setSearchQuery(params.query);
          console.log('[App] After setSearchQuery call completed');
        } else {
          console.log('[App] No search query to apply');
        }
        
        if (params.expression) {
          console.log('[App] Parsing and applying boolean expression:', params.expression);
          const expression = urlParamToExpression(params.expression);
          if (expression) {
            console.log('[App] Successfully parsed expression, applying:', expression);
            console.log('[App] Before setBooleanExpression - current expression:', booleanExpression);
            setBooleanExpression(expression, params.query);
            console.log('[App] After setBooleanExpression call completed');
          } else {
            console.error('[App] Failed to parse boolean expression from param:', params.expression);
            // Fallback: treat expression as text query if it looks like simple text
            if (params.expression && !params.expression.includes('&&') && !params.expression.includes('||')) {
              console.log('[App] Using expression as fallback text query');
              setSearchQuery(params.expression);
            }
          }
        } else {
          console.log('[App] No boolean expression to apply');
        }
        
        if (params.archived) {
          console.log('[App] Setting archived filter to true');
          setShowArchived(true);
        }
        if (params.duplicates) {
          console.log('[App] Setting duplicates filter to true');
          setShowDuplicates(true);
        }
        break;

      case 'public':
        if (params.id) setPublicTxId(params.id);
        break;

      case 'shared':
        if (params.id) setShareToken(params.id);
        break;
    }
    } catch (error) {
      console.error('[App] Error applying deep link params:', error, 'params:', params);
      deepLinkStateRef.current.totalFailed++;
      
      // Implement retry logic for critical errors
      if (deepLinkRetryRef.current.attempts < deepLinkRetryRef.current.maxAttempts) {
        deepLinkRetryRef.current.attempts++;
        deepLinkRetryRef.current.lastAttempt = Date.now();
        deepLinkRetryRef.current.params = params;
        
        console.log('[App] Scheduling retry for deep link params:', {
          attempt: deepLinkRetryRef.current.attempts,
          maxAttempts: deepLinkRetryRef.current.maxAttempts,
          params
        });
        
        // Retry after a delay
        setTimeout(() => {
          if (deepLinkRetryRef.current.params) {
            console.log('[App] Retrying deep link application');
            actuallyApplyParams(deepLinkRetryRef.current.params!, `${source}-retry-${deepLinkRetryRef.current.attempts}`);
            deepLinkRetryRef.current.params = null;
          }
        }, 1000 * deepLinkRetryRef.current.attempts); // Exponential backoff
      } else {
        console.error('[App] Max retry attempts reached for deep link:', params);
        deepLinkRetryRef.current.params = null;
      }
    }
  }, [prompts, collections.collections, setSearchQuery, setBooleanExpression, loadSavedSearch, setShowArchived, setShowDuplicates]);

  useEffect(() => {
    applyProtocolLinkParamsRef.current = (params: ProtocolLinkParams, source = 'unknown') => {
      console.log('[App] applyProtocolLinkParams called:', params, 'source:', source);
      console.log('[App] Current app state in applyProtocolLinkParams:', {
        connected,
        hasPassword,
        promptsLength: prompts.length,
        collectionsLoaded: !!collections.collections
      });
      
      // Update tracking state
      deepLinkStateRef.current.totalReceived++;
      deepLinkStateRef.current.lastReceived = new Date().toISOString();
      deepLinkStateRef.current.sources[source] = (deepLinkStateRef.current.sources[source] || 0) + 1;
      
      console.log('[App] Deep link state updated:', deepLinkStateRef.current);

      // For types that don't require app state (public/shared views), apply immediately
      if (params.type === 'public' || params.type === 'shared') {
        console.log('[App] Immediate application for public/shared type');
        actuallyApplyParams(params, source);
        return;
      }

      // For other types, check if app state is ready
      const appState = {
        connected,
        hasPassword,
        promptsLoaded: prompts.length > 0,
        collectionsLoaded: !!collections.collections
      };
      
      console.log('[App] App state check:', appState);
      
      // Guard: defer if not connected, no password, or prompts not loaded
      if (!connected || !hasPassword || prompts.length === 0) {
        console.log('[App] App state not ready, storing deep link for later:', appState);
        pendingDeepLinkRef.current = params;
        deepLinkStateRef.current.totalPending++;
        return;
      }

      // App is ready, apply immediately
      console.log('[App] App state ready, applying immediately');
      actuallyApplyParams(params, source);
    };

    // Apply any pending deep link once app becomes ready
    if (connected && hasPassword && prompts.length > 0 && pendingDeepLinkRef.current) {
      console.log('[App] App now ready, applying pending deep link:', pendingDeepLinkRef.current);
      const pendingParams = pendingDeepLinkRef.current;
      pendingDeepLinkRef.current = null; // Clear before applying to prevent loops
      
      // Add a small delay to ensure state is fully settled
      setTimeout(() => {
        actuallyApplyParams(pendingParams, 'pending-delayed');
      }, 100);
    }
    
    // Log app state readiness changes
    console.log('[App] App state readiness check:', {
      connected,
      hasPassword,
      promptsLoaded: prompts.length > 0,
      hasPending: !!pendingDeepLinkRef.current,
      pendingParams: pendingDeepLinkRef.current
    });
  }, [connected, hasPassword, prompts, collections.collections, actuallyApplyParams]);

  // Listen for Tauri deep link events (only set up once on mount)
  useEffect(() => {
    console.log('[App] Deep link setup useEffect running, isTauri:', isTauri());
    if (!isTauri()) {
      console.log('[App] Not in Tauri environment, skipping deep link setup');
      return;
    }

    let unlisten: (() => void) | undefined;
    let setupComplete = false;

    const setupTauriDeepLinks = async () => {
      if (setupComplete) {
        console.log('[App] Deep link setup already completed, skipping');
        return;
      }

      console.log('[App] Setting up Tauri deep links...', {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        devMode: process.env.NODE_ENV === 'development'
      });
      try {
        // Dynamic import to avoid issues in web environment
        const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
        const { listen } = await import('@tauri-apps/api/event');
        const { invoke } = await import('@tauri-apps/api/core');
        console.log('[App] Deep link imports complete');

        // Check if app was launched with a deep link (cold start) - all platforms
        console.log('[App] About to call getCurrent() for deep links...');
        const urls = await getCurrent();
        console.log('[App] getCurrent() returned:', urls);
        if (urls && urls.length > 0) {
          console.log('[App] Tauri cold start deep link detected:', urls[0]);
          const params = parseProtocolUrl(urls[0]);
          console.log('[App] Parsed cold start params:', params);
          console.log('[App] About to call applyProtocolLinkParamsRef.current for cold start...');
          applyProtocolLinkParamsRef.current(params, 'tauri-cold-start');
        } else {
          console.log('[App] No cold start deep links found');
        }

        // Listen for deep links while running - all platforms
        console.log('[App] About to set up onOpenUrl listener...');
        await onOpenUrl((urls: string[]) => {
          console.log('[App] onOpenUrl callback triggered with URLs:', urls);
          if (urls && urls.length > 0) {
            console.log('[App] Tauri onOpenUrl deep link detected:', urls[0]);
            const params = parseProtocolUrl(urls[0]);
            console.log('[App] Parsed onOpenUrl params:', params);
            console.log('[App] About to call applyProtocolLinkParamsRef.current for onOpenUrl...');
            applyProtocolLinkParamsRef.current(params, 'tauri-onopenurl');
          }
        });
        console.log('[App] onOpenUrl listener set up successfully');

        // Listen for single-instance forwarded links (Windows/Linux)
        // Set up listener BEFORE signaling ready to avoid race condition
        unlisten = await listen<string>('deep-link', (event) => {
          console.log('[App] Tauri single-instance deep link event received (Windows/Linux):', event.payload);
          // Also write to file for debugging
          if (typeof window !== 'undefined' && (window as any).__TAURI__) {
            const { writeTextFile } = require('@tauri-apps/plugin-fs');
            writeTextFile('/tmp/deep-link-frontend.log', `[${new Date().toISOString()}] Deep link event received: ${event.payload}\n`, { append: true }).catch(() => {});
          }
          
          try {
            const params = parseProtocolUrl(event.payload);
            console.log('[App] Parsed single-instance params:', params);
            applyProtocolLinkParamsRef.current(params, 'tauri-single-instance-winlinux');
          } catch (parseError) {
            console.error('[App] Failed to parse single-instance deep link:', parseError, 'URL:', event.payload);
          }
        });
        console.log('[App] Deep link listener registered successfully');

        // Signal to Rust that frontend is ready and get any pending cold-start deep link
        // This uses a Tauri command instead of events for reliable cross-process communication
        console.log('[App] About to call frontend_ready command...');
        const pendingUrl = await invoke<string | null>('frontend_ready');
        console.log('[App] frontend_ready returned:', pendingUrl);
        if (pendingUrl) {
          console.log('[App] Processing cold-start deep link from Rust (Windows/Linux):', pendingUrl);
          try {
            const params = parseProtocolUrl(pendingUrl);
            console.log('[App] Parsed frontend_ready params:', params);
            console.log('[App] About to call applyProtocolLinkParamsRef.current for frontend_ready...');
            applyProtocolLinkParamsRef.current(params, 'tauri-cold-start-winlinux');
          } catch (parseError) {
            console.error('[App] Failed to parse frontend_ready deep link:', parseError, 'URL:', pendingUrl);
          }
        } else {
          console.log('[App] No pending deep link from frontend_ready');
        }

        setupComplete = true;
        console.log('[App] Deep link setup completed successfully');
      } catch (error) {
        console.error('[App] Failed to setup Tauri deep links:', error);
        // Retry setup after delay
        setTimeout(() => {
          console.log('[App] Retrying deep link setup...');
          setupTauriDeepLinks();
        }, 2000);
      }
    };

    setupTauriDeepLinks();

    // Fallback: periodically check for missed deep links
    const fallbackInterval = setInterval(() => {
      if (connected && hasPassword && prompts.length > 0) {
        // Try to get any pending deep links that might have been missed
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke<string | null>('frontend_ready').then(pendingUrl => {
            if (pendingUrl) {
              console.log('[App] Fallback found pending deep link:', pendingUrl);
              const params = parseProtocolUrl(pendingUrl);
              applyProtocolLinkParamsRef.current(params, 'fallback-check');
            }
          }).catch(() => {
            // Silently ignore fallback errors
          });
        }).catch(() => {
          // Silently ignore import errors
        });
      }
    }, 5000); // Check every 5 seconds

    return () => {
      if (unlisten) unlisten();
      clearInterval(fallbackInterval);
    };
  }, []); // Empty deps - only set up listener once

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
        // Returning user with encrypted prompts - show password prompt
        console.log('[App] User has encrypted prompts, showing unlock dialog');
        setPasswordPromptOpen(true);
      } else {
        // New user - show password setup
        console.log('[App] New user, showing password setup dialog');
        setPasswordPromptOpen(true);
      }
    };

    checkForEncryptedPrompts();
  }, [connected, hasPassword, isLoadingPassword, address]);

  // Load prompts on identity connected
  useEffect(() => {
    if (identity.connected) {
      loadPrompts();
    }
  }, [identity.connected, loadPrompts]);

  const handlePasswordSet = (newPassword: string) => {
    setPassword(newPassword);
    setPasswordPromptOpen(false);
  };

  const handlePasswordUnlock = (unlockedPassword: string) => {
    setPassword(unlockedPassword);
    setPasswordUnlockOpen(false);
    setSampleEncryptedData(null);
  };

  // Pre-compute duplicate IDs separately (O(n²) operation - only runs when prompts change)
  const duplicateIds = useMemo(() => {
    if (!showDuplicates) return null;
    return new Set(findDuplicates(prompts).flatMap(group => group.prompts.map(p => p.id)));
  }, [prompts, showDuplicates]);

  // Pre-compute timestamps for sorting (avoid Date creation during sort)
  const timestampMap = useMemo(() =>
    new Map(prompts.map(p => [p.id, new Date(p.updatedAt).getTime()])),
    [prompts]
  );

  // Filter prompts based on search and tags (memoized for performance)
  // Uses effectiveSearchQuery: deferred for typing (smooth), instant for clearing
  const filteredPrompts = useMemo(() => {
    console.log('[App] Filtering prompts:', {
      totalPrompts: prompts.length,
      effectiveSearchQuery,
      searchQuery,
      booleanExpression,
      showArchived,
      showDuplicates,
      selectedTags
    });
    
    // Get search results with scores for sorting
    const searchResults = effectiveSearchQuery ? searchPrompts(effectiveSearchQuery) : [];
    const searchScoreMap = new Map(searchResults.map(r => [r.id, r.score]));
    
    console.log('[App] Search results:', {
      query: effectiveSearchQuery,
      resultCount: searchResults.length,
      results: searchResults.slice(0, 5) // First 5 for debugging
    });

    const finalResult = prompts
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
        if (effectiveSearchQuery) {
          if (!searchScoreMap.has(prompt.id)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // When searching, sort by FlexSearch relevance score
        if (effectiveSearchQuery && searchScoreMap.size > 0) {
          return (searchScoreMap.get(b.id) || 0) - (searchScoreMap.get(a.id) || 0);
        }
        // Default sort by updatedAt (most recent first) - use pre-computed timestamps
        return (timestampMap.get(b.id) || 0) - (timestampMap.get(a.id) || 0);
      });
    
    console.log('[App] Final filtered prompts:', {
      beforeFilter: prompts.length,
      afterFilter: finalResult.length,
      effectiveSearchQuery,
      hasBooleanExpression: !!booleanExpression,
      showArchived,
      showDuplicates
    });
    
    return finalResult;
  }, [prompts, effectiveSearchQuery, showArchived, duplicateIds, booleanExpression, selectedTags, timestampMap]);

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

  // Track desktop SearchBar visibility to show floating version when scrolled past
  const wasSearchBarVisibleRef = useRef(true);
  useEffect(() => {
    const checkSearchBarVisibility = () => {
      if (!desktopSearchBarContainerRef.current) return;

      const rect = desktopSearchBarContainerRef.current.getBoundingClientRect();
      // Consider invisible when the bottom of the search bar is above the header (80px)
      const isVisible = rect.bottom > 80;

      // If transitioning from floating (invisible) back to normal (visible), scroll to top
      if (isVisible && !wasSearchBarVisibleRef.current) {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }

      wasSearchBarVisibleRef.current = isVisible;
      setIsSearchBarVisible(isVisible);
    };

    // Check on scroll
    window.addEventListener('scroll', checkSearchBarVisibility, { passive: true });
    // Initial check
    checkSearchBarVisibility();

    return () => window.removeEventListener('scroll', checkSearchBarVisibility);
  }, []);

  // Reset selected index when filtered prompts change
  // Use effectiveSearchQuery to stay in sync with filtering
  useEffect(() => {
    setSelectedIndex(-1);
  }, [filteredPrompts.length, effectiveSearchQuery, selectedTags, booleanExpression, showArchived]);

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

        const rect = selectedElement.getBoundingClientRect();
        const headerHeight = 100; // Approximate height of sticky header + padding

        // Check if element is behind the header (at top)
        if (rect.top < headerHeight) {
          const scrollAmount = rect.top - headerHeight - 20; // 20px extra padding, negative to scroll up
          window.scrollBy({ top: scrollAmount, behavior: 'instant' });
        }
        // If floating search bar is visible (desktop, scrolled down), ensure element isn't behind it
        else if (!isSearchBarVisible && window.innerWidth >= 640) {
          const floatingSearchBarHeight = 160; // Approximate height of floating search bar + padding
          const viewportBottom = window.innerHeight - floatingSearchBarHeight;

          // If element bottom is below the visible area (behind floating search bar), scroll more
          if (rect.bottom > viewportBottom) {
            const scrollAmount = rect.bottom - viewportBottom + 20; // 20px extra padding
            window.scrollBy({ top: scrollAmount, behavior: 'instant' });
          }
        }
      }

      // Update previous index for next comparison
      previousIndexRef.current = selectedIndex;
    }
  }, [selectedIndex, filteredPrompts.length, isSearchBarVisible]);

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
          // If in search input, go to first result
          if (isSearchInput) {
            setSelectedIndex(0);
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
          // If in search input, go to last result
          if (isSearchInput) {
            setSelectedIndex(numResults - 1);
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
        case '?':
          // Show hotkeys dialog (works even when other dialogs are open)
          if (!isTyping) {
            event.preventDefault();
            setHotkeysOpen(true);
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

    try {
      // Fetch version content from Turso
      const { getVersionContent } = await import('@/backend/api/turso-queries');
      const content = await getVersionContent(version.txId);

      if (!content) {
        console.error('[App] Failed to get version content');
        return;
      }

      // Update prompt with restored content
      await updatePrompt(selectedPrompt.id, {
        content,
      }, password || undefined);

      // Close version history and refresh prompt
      setVersionHistoryOpen(false);
      setViewDialogOpen(false);
    } catch (error) {
      console.error('[App] Failed to restore version:', error);
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

  // Shared prompt view (no authentication required)
  if (shareToken) {
    return <TursoSharedPromptView shareToken={shareToken} onBack={handleExitSharedView} />;
  }

  // Public prompt view (no wallet required) - for Arweave public prompts
  if (publicTxId) {
    return <PublicPromptView txId={publicTxId} onBack={handleExitPublicView} />;
  }

  if (!connected) {
    // Show loading spinner while initializing
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 pointer-events-none px-4 sm:px-6 lg:px-10 pt-[calc(env(safe-area-inset-top)+0.85rem)]">
        <div className="mx-auto max-w-6xl">
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
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Import/Export</p>
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
      <main className={`space-y-2 px-4 pt-6 pb-[calc(11rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-10 lg:px-10 ${
        !isSearchBarVisible ? 'sm:pb-48' : 'sm:pb-12'
      }`}>
        <section className="mx-auto flex max-w-6xl flex-col gap-4">
          {/* Desktop SearchBar - hidden on mobile, becomes fixed when scrolled past */}
          <div ref={desktopSearchBarContainerRef} className="hidden sm:block">
            {/* Placeholder to maintain layout when search bar is fixed */}
            <div className={isSearchBarVisible ? 'hidden' : 'block'}>
              <div className="h-[120px]" /> {/* Approximate height of SearchBar */}
            </div>
            {/* Actual SearchBar - fixed when scrolled past */}
            <div
              className={`transition-all duration-200 ease-out ${
                isSearchBarVisible
                  ? ''
                  : 'fixed inset-x-0 bottom-0 z-40 px-6 pb-6 lg:px-10'
              }`}
            >
              <div className={isSearchBarVisible ? '' : 'mx-auto max-w-6xl shadow-2xl shadow-black/20 rounded-lg'}>
                <SearchBar
                  ref={searchBarRef}
                  showArchived={showArchived}
                  setShowArchived={setShowArchived}
                  viewMode={viewMode}
                  onViewModeToggle={toggleViewMode}
                  showDuplicates={showDuplicates}
                  setShowDuplicates={setShowDuplicates}
                  collections={collections}
                  showNewPromptButton={!isSearchBarVisible}
                  onCreateNew={handleCreateNew}
                />
              </div>
            </div>
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

      {/* Floating Search Bar - Mobile */}
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

      {/* Floating Action Button - hidden on desktop when search bar is floating */}
      <Button
        onClick={handleCreateNew}
        size="lg"
        className={`fixed bottom-6 right-6 sm:bottom-6 sm:right-6 rounded-full shadow-xl hover:shadow-2xl transition-all hover:scale-110 active:scale-95 z-50 h-16 w-16 sm:h-14 sm:w-14 md:h-12 md:w-auto md:px-6 flex items-center justify-center ${
          !isSearchBarVisible ? 'sm:hidden' : ''
        }`}
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

      <HotkeysDialog
        open={hotkeysOpen}
        onOpenChange={setHotkeysOpen}
      />
    </div>
  );
}

export default App;