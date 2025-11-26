import { Search, X, Filter, Bookmark, Archive, LayoutGrid, List, Plus } from 'lucide-react';
import { Input } from '@/frontend/components/ui/input';
import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { SavedSearchesDialog } from '@/frontend/components/search/SavedSearchesDialog';
import { usePrompts } from '@/frontend/hooks/usePrompts';
import { getAllTags } from '@/core/search';
import { expressionToString, parseBooleanExpression } from '@/core/search/boolean';
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type { BooleanExpression, SavedSearch } from '@/shared/types/prompt';
import type { UseCollectionsReturn } from '@/frontend/hooks/useCollections';
import { BooleanBuilder } from '@/frontend/components/search/BooleanBuilder';
import { getDuplicateCount } from '@/core/validation/duplicates';

interface SearchBarProps {
  showArchived: boolean;
  setShowArchived: (show: boolean) => void;
  viewMode: 'list' | 'cards';
  onViewModeToggle: () => void;
  showDuplicates: boolean;
  setShowDuplicates: (show: boolean) => void;
  collections: UseCollectionsReturn;
  showNewPromptButton?: boolean;
  onCreateNew?: () => void;
}

export interface SearchBarHandle {
  focusSearchInput: () => void;
  blurSearchInput: () => void;
}

export const SearchBar = forwardRef<SearchBarHandle, SearchBarProps>(({ showArchived, setShowArchived, viewMode, onViewModeToggle, showDuplicates, setShowDuplicates, collections, showNewPromptButton = false, onCreateNew }, ref) => {
  const {
    prompts,
    searchQuery,
    setSearchQuery,
    selectedTags,
    toggleTag,
    booleanExpression,
    activeSavedSearch,
    setBooleanExpression,
    loadSavedSearch,
    clearBooleanSearch,
  } = usePrompts();
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [showBooleanBuilder, setShowBooleanBuilder] = useState(false);
  const [expressionText, setExpressionText] = useState('');
  const [savedSearchesDialogOpen, setSavedSearchesDialogOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Inline autocomplete state
  const [inlineSuggestion, setInlineSuggestion] = useState('');

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    focusSearchInput: () => {
      searchInputRef.current?.focus();
    },
    blurSearchInput: () => {
      searchInputRef.current?.blur();
    }
  }));

  useEffect(() => {
    const tags = getAllTags(prompts);
    setAllTags(tags);
  }, [prompts]);

  // Auto-focus search bar on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Update inline suggestion when search query or cursor position changes
  useEffect(() => {
    if (!searchInputRef.current) {
      setInlineSuggestion('');
      return;
    }

    const input = searchInputRef.current;
    const cursorPos = input.selectionStart || 0;

    // Only show suggestion if cursor is at the end of the text
    if (cursorPos !== searchQuery.length) {
      setInlineSuggestion('');
      return;
    }

    const textBeforeCursor = searchQuery.slice(0, cursorPos);
    const lastHashIndex = textBeforeCursor.lastIndexOf('#');

    if (lastHashIndex !== -1) {
      const tagQuery = textBeforeCursor.slice(lastHashIndex + 1);

      // Check if we're still in a tag (no space after #)
      if (!tagQuery.includes(' ') && tagQuery.length > 0) {
        // Find first tag that starts with the query
        const matchingTag = allTags.find(tag =>
          tag.toLowerCase().startsWith(tagQuery.toLowerCase())
        );

        if (matchingTag && matchingTag.toLowerCase() !== tagQuery.toLowerCase()) {
          // Show the remaining part of the tag
          const suggestion = matchingTag.slice(tagQuery.length);
          setInlineSuggestion(suggestion);
          return;
        }
      }
    }

    setInlineSuggestion('');
  }, [searchQuery, allTags]);

  // Handle inline autocomplete acceptance
  const acceptInlineSuggestion = () => {
    if (!inlineSuggestion || !searchInputRef.current) return;

    const newQuery = searchQuery + inlineSuggestion + ' ';
    setSearchQuery(newQuery);
    setInlineSuggestion('');

    // Set cursor position after the space
    setTimeout(() => {
      const input = searchInputRef.current;
      if (input) {
        input.setSelectionRange(newQuery.length, newQuery.length);
        input.focus();
      }
    }, 0);
  };

  // Handle keyboard navigation for inline suggestion
  const handleInlineAutocompleteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!inlineSuggestion) return;

    if (e.key === 'Tab' || e.key === 'ArrowRight') {
      e.preventDefault();
      acceptInlineSuggestion();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInlineSuggestion('');
    }
  };

  // Keyboard shortcuts: / and cmd+k/ctrl+k
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if user is typing in an input or textarea
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Handle / key (only when not already typing)
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      // Handle cmd+k or ctrl+k
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLoadSavedSearch = (search: SavedSearch) => {
    loadSavedSearch(search);
  };

  const handleApplyExpression = (expression: BooleanExpression) => {
    setBooleanExpression(expression, searchQuery || undefined);
    setShowBooleanBuilder(false);
  };

  const tagLabel = allTags.length === 1 ? 'tag' : 'tags';
  const duplicateCount = getDuplicateCount(prompts);

  return (
    <div className="space-y-4">
      <div className="border border-border bg-card rounded-lg relative px-5 py-4 sm:px-4 sm:py-3 space-y-3 shadow-sm">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 sm:left-3 top-1/2 h-5 w-5 sm:h-4 sm:w-4 -translate-y-1/2 text-muted-foreground" />

          {/* Inline suggestion overlay */}
          {inlineSuggestion && (
            <div
              className="pointer-events-none absolute left-11 sm:left-10 top-1/2 -translate-y-1/2 text-base sm:text-sm text-muted-foreground/50"
              style={{
                whiteSpace: 'pre',
                fontFamily: 'inherit'
              }}
            >
              <span className="invisible">{searchQuery}</span>{inlineSuggestion}
            </div>
          )}

          <Input
            ref={searchInputRef}
            type="text"
            placeholder={booleanExpression ? 'Additional text filter…' : 'Search prompts…'}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleInlineAutocompleteKeyDown}
            className="h-11 sm:h-9 w-full border-0 bg-transparent pl-11 sm:pl-10 pr-24 sm:pr-20 text-base sm:text-sm focus-visible:ring-0 py-0"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="rounded-full p-1.5 sm:p-1 text-muted-foreground transition-all hover:text-foreground active:scale-95"
                title="Clear search"
              >
                <X className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
            )}
            <Button
              variant={booleanExpression || showBooleanBuilder ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setShowBooleanBuilder((open) => !open)}
              className="h-8 w-8 sm:h-7 sm:w-7 p-0"
              title="Filter builder"
            >
              <Filter className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
            {showNewPromptButton && onCreateNew && (
              <Button
                variant="default"
                size="sm"
                onClick={onCreateNew}
                className="h-8 w-8 sm:h-7 sm:w-7 p-0 transition-all duration-300 animate-in fade-in slide-in-from-right-2"
                title="New Prompt"
              >
                <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {!booleanExpression && !showBooleanBuilder && (
          <>
            <div
              className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground cursor-pointer pt-2 border-t border-border"
              onClick={() => {
                const newValue = !showTagSuggestions;
                setShowTagSuggestions(newValue);
              }}
            >
              <div className="font-medium text-foreground transition-colors hover:text-primary text-[13px] sm:text-xs pl-2">
                {showTagSuggestions ? 'Hide tag filters' : 'Show tag filters'} ({allTags.length} {tagLabel})
              </div>
              <div className="flex items-center gap-2.5 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSavedSearchesDialogOpen(true)}
                  className="h-8 w-8 sm:h-7 sm:w-7 p-0 text-muted-foreground"
                  title="Collections"
                >
                  <Bookmark className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </Button>
                <Button
                  variant={showArchived ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setShowArchived(!showArchived)}
                  className={`h-8 w-8 sm:h-7 sm:w-7 p-0 ${showArchived ? '' : 'text-muted-foreground'}`}
                  title={showArchived ? 'Hide archived' : 'Show archived'}
                >
                  <Archive className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    onViewModeToggle();
                    // Blur the button to prevent focus outline during keyboard navigation
                    (e.currentTarget as HTMLButtonElement).blur();
                  }}
                  className="hidden md:flex h-7 w-7 p-0"
                  title={viewMode === 'list' ? 'Switch to cards view' : 'Switch to list view'}
                >
                  {viewMode === 'list' ? (
                    <LayoutGrid className="h-4 w-4" />
                  ) : (
                    <List className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {showTagSuggestions && (
              <div className="flex flex-wrap gap-2.5 sm:gap-2">
                {allTags.length > 0 ? (
                  allTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <Badge
                        key={tag}
                        variant={isSelected ? 'default' : 'outline'}
                        className={`cursor-pointer rounded-full px-3.5 sm:px-3 py-1.5 sm:py-1 text-[13px] sm:text-xs transition-colors active:scale-95 ${isSelected ? 'hover:bg-primary hover:text-primary-foreground' : ''}`}
                        onClick={() => {
                          toggleTag(tag);
                          // Update expression but don't open the builder
                          const updatedTags = isSelected
                            ? selectedTags.filter(t => t !== tag)
                            : [...selectedTags, tag];
                          if (updatedTags.length > 0) {
                            const tagsExpression = updatedTags.map(t => `"${t}"`).join(' AND ');
                            setExpressionText(tagsExpression);
                            try {
                              const parsed = parseBooleanExpression(tagsExpression);
                              handleApplyExpression(parsed);
                            } catch {
                              // Invalid expression, ignore
                            }
                          } else {
                            // No tags selected, clear the filter
                            clearBooleanSearch();
                          }
                        }}
                      >
                        {tag}
                      </Badge>
                    );
                  })
                ) : (
                  <div className="text-[13px] sm:text-xs text-muted-foreground">No tags yet. Add tags to your prompts!</div>
                )}
              </div>
            )}
          </>
        )}

        {booleanExpression && !showBooleanBuilder && (
          <div
            className="flex items-center gap-2 text-sm cursor-pointer transition-colors border-t border-border pt-3 pb-3 -mx-5 -mb-4 sm:-mx-4 sm:-mb-3 px-9 sm:px-8 bg-muted/50 rounded-b-lg"
            onClick={() => {
              setExpressionText(expressionToString(booleanExpression));
              setShowBooleanBuilder(true);
            }}
            title="Click to edit filter"
          >
            <Filter className="h-4 w-4 text-primary" />
            <div className="flex-1 min-w-0">
              {activeSavedSearch ? (
                <span className="font-medium text-primary">{activeSavedSearch.name}</span>
              ) : (
                <code className="truncate text-xs text-primary">{expressionToString(booleanExpression)}</code>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearBooleanSearch();
                setShowBooleanBuilder(false);
                setShowTagSuggestions(false);
                searchInputRef.current?.focus();
              }}
              className="rounded-full p-1 text-primary/70 transition-colors hover:text-primary"
              title="Remove filter"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {showBooleanBuilder && (
          <BooleanBuilder
            allTags={allTags}
            prompts={prompts}
            searchQuery={searchQuery}
            expressionText={expressionText}
            onExpressionChange={setExpressionText}
            onApply={handleApplyExpression}
            onClose={() => {
              setShowBooleanBuilder(false);
              setShowTagSuggestions(false);
              searchInputRef.current?.focus();
            }}
            isOpen={showBooleanBuilder}
            collections={collections}
            embedded
          />
        )}
      </div>

      <SavedSearchesDialog
        open={savedSearchesDialogOpen}
        onOpenChange={setSavedSearchesDialogOpen}
        onLoad={handleLoadSavedSearch}
        onEdit={(search) => {
          setExpressionText(expressionToString(search.expression));
          setShowBooleanBuilder(true);
          setSavedSearchesDialogOpen(false);
        }}
        showDuplicates={showDuplicates}
        setShowDuplicates={setShowDuplicates}
        duplicateCount={duplicateCount}
        collections={collections}
      />
    </div>
  );
});
