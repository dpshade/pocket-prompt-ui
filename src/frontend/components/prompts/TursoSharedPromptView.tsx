/**
 * TursoSharedPromptView - Display a shared prompt by share token
 */

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, ArrowLeft, Link } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Badge } from '@/frontend/components/ui/badge';
import { UploadDialog } from '@/frontend/components/shared/UploadDialog';
import type { Prompt } from '@/shared/types/prompt';
import type { FileImportResult } from '@/shared/utils/import';
import * as tursoQueries from '@/backend/api/turso-queries';
import { usePrompts } from '@/frontend/hooks/usePrompts';

interface TursoSharedPromptViewProps {
  shareToken: string;
  onBack: () => void;
}

export function TursoSharedPromptView({ shareToken, onBack }: TursoSharedPromptViewProps) {
  const { addPrompt, prompts } = usePrompts();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  useEffect(() => {
    async function loadPrompt() {
      try {
        setLoading(true);
        setError(null);

        const fetchedPrompt = await tursoQueries.getPromptByShareToken(shareToken);

        if (!fetchedPrompt) {
          throw new Error('Prompt not found or share link has expired');
        }

        setPrompt(fetchedPrompt);
      } catch (err) {
        console.error('Failed to load shared prompt:', err);
        setError(err instanceof Error ? err.message : 'Failed to load prompt');
      } finally {
        setLoading(false);
      }
    }

    loadPrompt();
  }, [shareToken]);

  const handleCopy = () => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareLink = () => {
    const shareUrl = `${window.location.origin}?share=${shareToken}`;
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleSaveToLibrary = () => {
    setUploadDialogOpen(true);
  };

  const handleImport = async (selectedPrompts: FileImportResult[]) => {
    for (const result of selectedPrompts) {
      if (result.success && result.prompt) {
        await addPrompt({
          title: result.prompt.title,
          description: result.prompt.description,
          content: result.prompt.content,
          tags: result.prompt.tags,
          currentTxId: '',
          versions: [],
          isArchived: false,
          isSynced: false,
        });
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!prompt) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (isTyping) return;

      switch (event.key.toLowerCase()) {
        case 'c':
          event.preventDefault();
          handleCopy();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prompt]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-none border-b bg-background">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="flex items-center gap-2 mr-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="flex items-center justify-center w-full mx-auto">
            <h1 className="flex items-center gap-2.5 sm:gap-2 text-lg font-bold sm:text-xl md:text-2xl">
              <img src="/logo.svg" alt="Pocket Prompt Logo" className="h-6 w-6 sm:h-6 sm:w-6" />
              <span>Pocket Prompt</span>
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="relative inline-block">
              <div className="animate-spin inline-block w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full" role="status">
                <span className="sr-only">Loading...</span>
              </div>
              <img src="/logo.svg" alt="Pocket Prompt Logo" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 animate-pulse" />
            </div>
            <p className="mt-4 text-muted-foreground animate-pulse">Loading shared prompt...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 space-y-4">
            <div className="text-destructive text-lg font-medium">{error}</div>
            <p className="text-muted-foreground">
              This share link may have expired or been removed.
            </p>
            <Button onClick={onBack} variant="outline">
              Go to App
            </Button>
          </div>
        ) : prompt ? (
          <div className="space-y-4">
            {/* Prompt Card */}
            <div className="border border-border rounded-lg bg-card p-4 sm:p-6">
              {/* Title and Badge */}
              <div className="space-y-3 mb-4">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-2xl font-bold">{prompt.title}</h2>
                  <Badge variant="secondary" className="shrink-0 flex items-center gap-1.5 bg-green-500/15 text-green-700 dark:text-green-400">
                    <Link className="h-3 w-3" />
                    Shared
                  </Badge>
                </div>

                {prompt.description && (
                  <p className="text-muted-foreground">{prompt.description}</p>
                )}
              </div>

              {/* Tags */}
              {prompt.tags && prompt.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {prompt.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Metadata */}
              <div className="text-xs text-muted-foreground space-y-1 mb-4">
                <div>Created: {formatDate(prompt.createdAt)}</div>
                <div>Last updated: {formatDate(prompt.updatedAt)}</div>
              </div>

              {/* Content */}
              <div className="rounded-md border bg-muted/50 p-4 mb-4 max-h-[40vh] overflow-y-auto">
                <pre className="whitespace-pre-wrap font-mono text-sm">
                  {prompt.content}
                </pre>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end flex-wrap">
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  title="Copy prompt content (C)"
                >
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleShareLink}
                >
                  {linkCopied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Link Copied!
                    </>
                  ) : (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Share Link
                    </>
                  )}
                </Button>

                <Button
                  variant="default"
                  onClick={handleSaveToLibrary}
                >
                  Save to My Library
                </Button>
              </div>
            </div>

            {/* Info Box */}
            <div className="border border-border/50 rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
              <p>
                This is a shared prompt from Pocket Prompt.
                Click "Save to My Library" to add this prompt to your personal collection.
              </p>
              <p className="text-xs">
                <strong>Keyboard shortcut:</strong> Press <kbd className="px-1.5 py-0.5 text-xs bg-background border rounded">C</kbd> to copy
              </p>
            </div>
          </div>
        ) : null}
      </main>

      {/* Upload Dialog for Save to Library */}
      {prompt && (
        <UploadDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          onImport={handleImport}
          existingPromptIds={prompts.map(p => p.id)}
          existingPrompts={prompts}
          initialPrompts={[
            {
              fileName: `${prompt.title}.md`,
              success: true,
              prompt: {
                id: crypto.randomUUID(), // Generate new ID for the saved copy
                title: prompt.title,
                description: prompt.description,
                content: prompt.content,
                tags: prompt.tags,
                createdAt: prompt.createdAt,
                updatedAt: prompt.updatedAt,
              },
            },
          ]}
        />
      )}
    </div>
  );
}
