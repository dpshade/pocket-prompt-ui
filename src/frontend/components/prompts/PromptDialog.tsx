import { Copy, Edit, Archive, History, Check, Lock, Globe, Share2, Link, Loader2, X } from 'lucide-react';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/frontend/components/ui/dialog';
import { Button } from '@/frontend/components/ui/button';
import { Badge } from '@/frontend/components/ui/badge';
import type { Prompt } from '@/shared/types/prompt';
import { useState, useEffect } from 'react';
import { wasPromptEncrypted } from '@/core/encryption/crypto';
import { FEATURE_FLAGS } from '@/shared/config/features';
import * as tursoQueries from '@/backend/api/turso-queries';

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: Prompt | null;
  onEdit: () => void;
  onArchive: () => void;
  onShowVersions: () => void;
}

export function PromptDialog({
  open,
  onOpenChange,
  prompt,
  onEdit,
  onArchive,
  onShowVersions,
}: PromptDialogProps) {
  const [copied, setCopied] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  // Fetch share token when dialog opens
  useEffect(() => {
    if (open && prompt && FEATURE_FLAGS.TURSO_ENABLED) {
      tursoQueries.getShareToken(prompt.id).then(setShareToken);
    }
  }, [open, prompt]);

  // Reset share state when dialog closes
  useEffect(() => {
    if (!open) {
      setShareToken(null);
      setShareLinkCopied(false);
    }
  }, [open]);

  const handleShare = async () => {
    if (!prompt || !FEATURE_FLAGS.TURSO_ENABLED) return;

    setIsSharing(true);
    try {
      const token = await tursoQueries.generateShareToken(prompt.id);
      setShareToken(token);
      // Copy the share link to clipboard
      const shareUrl = `${window.location.origin}?share=${token}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 2000);
    } catch (error) {
      console.error('Failed to generate share link:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareToken) return;
    const shareUrl = `${window.location.origin}?share=${shareToken}`;
    await navigator.clipboard.writeText(shareUrl);
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  const handleUnshare = async () => {
    if (!prompt || !FEATURE_FLAGS.TURSO_ENABLED) return;

    try {
      await tursoQueries.removeShareToken(prompt.id);
      setShareToken(null);
    } catch (error) {
      console.error('Failed to remove share link:', error);
    }
  };

  // Check if prompt has version history based on the latest version number
  const hasVersionHistory = (prompt: Prompt | null) => {
    if (!prompt || !prompt.versions || prompt.versions.length === 0) return false;
    const latestVersion = prompt.versions[prompt.versions.length - 1];
    return latestVersion && latestVersion.version > 1;
  };

  // Keyboard shortcuts for the dialog
  useEffect(() => {
    if (!open || !prompt) return;

    const handleCopy = () => {
      navigator.clipboard.writeText(prompt.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Don't handle shortcuts when typing
      if (isTyping) return;

      switch (event.key) {
        case 'e':
          event.preventDefault();
          onEdit();
          break;
        case 'c':
          event.preventDefault();
          handleCopy();
          break;
        case 'a':
          if (!prompt.isArchived) {
            event.preventDefault();
            onArchive();
            onOpenChange(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, prompt, onEdit, onArchive, onOpenChange]);

  if (!prompt) return null;

  const isEncrypted = wasPromptEncrypted(prompt.tags);
  const isPublic = !isEncrypted;

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const characterCount = typeof prompt.content === 'string' ? prompt.content.length : 0;
  const wordCount = typeof prompt.content === 'string'
    ? prompt.content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex max-h-[88vh] flex-col">
        <DialogHeader className="space-y-4 text-left border-b">
          <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <DialogTitle className="text-3xl sm:text-4xl font-semibold tracking-tight">
                  {prompt.title}
                </DialogTitle>
                {prompt.description && (
                  <DialogDescription className="text-base text-foreground/70 max-w-2xl">
                    {prompt.description}
                  </DialogDescription>
                )}
              </div>

              {prompt.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {prompt.tags.map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs px-3 py-1">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

            <div className="flex flex-wrap items-center gap-2">
                {FEATURE_FLAGS.TURSO_ENABLED ? (
                  shareToken ? (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 text-xs bg-green-500/15 text-green-700 dark:text-green-400"
                      title="This prompt has a shareable link"
                    >
                      <Link className="h-3.5 w-3.5" />
                      Shared
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="flex items-center gap-1.5 px-3 py-1 text-xs"
                      title="This prompt is private"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Private
                    </Badge>
                  )
                ) : (
                  <Badge
                    variant={isEncrypted ? 'default' : 'secondary'}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs"
                    title={isEncrypted
                      ? 'This prompt is encrypted. Only your wallet can decrypt it.'
                      : 'This prompt is public. Anyone can read it on Arweave.'}
                  >
                    {isPublic ? (
                      <>
                        <Globe className="h-3.5 w-3.5" />
                        Public
                      </>
                    ) : (
                      <>
                        <Lock className="h-3.5 w-3.5" />
                        Encrypted
                      </>
                    )}
                  </Badge>
                )}
                {hasVersionHistory(prompt) && (
                  <Badge variant="outline" className="px-3 py-1 text-xs">
                    v{prompt.versions[prompt.versions.length - 1]?.version}
                  </Badge>
                )}
                {prompt.isArchived && (
                  <Badge variant="outline" className="px-3 py-1 text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    Archived
                  </Badge>
                )}
              </div>
          </div>

          <div className="flex flex-col gap-1 text-xs text-foreground/60">
            <div>Created: <span className="font-medium text-foreground/80">{formatDate(prompt.createdAt)}</span></div>
            <div>Last updated: <span className="font-medium text-foreground/80">{formatDate(prompt.updatedAt)}</span></div>
            {prompt.currentTxId && (
              <div className="truncate" title={prompt.currentTxId}>
                Arweave TxID: <a
                  href={`https://viewblock.io/arweave/tx/${prompt.currentTxId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-foreground/80 hover:text-foreground underline decoration-dotted underline-offset-2"
                >
                  {prompt.currentTxId.slice(0, 12)}...{prompt.currentTxId.slice(-8)}
                </a>
              </div>
            )}
          </div>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-y-auto min-h-0">
          <div className="border rounded-xl p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-foreground/50">
              <span>{wordCount} words</span>
              <span>•</span>
              <span>{characterCount} characters</span>
              <span>•</span>
              <span>ID <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{prompt.id}</code></span>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed pr-1">
              {typeof prompt.content === 'string' ? prompt.content : 'Encrypted content unavailable'}
            </pre>
          </div>
        </DialogBody>

        <DialogFooter className="flex-row justify-end border-t">
          <Button
            variant="outline"
            onClick={handleCopy}
            size="sm"
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                <span className="hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </Button>

          {/* Share button - only show for Turso mode */}
          {FEATURE_FLAGS.TURSO_ENABLED && (
            shareToken ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  onClick={handleCopyShareLink}
                  size="sm"
                  className="gap-2"
                  title="Copy share link"
                >
                  {shareLinkCopied ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span className="hidden sm:inline">Link Copied</span>
                    </>
                  ) : (
                    <>
                      <Link className="h-4 w-4" />
                      <span className="hidden sm:inline">Copy Link</span>
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleUnshare}
                  size="sm"
                  className="px-2 text-muted-foreground hover:text-destructive"
                  title="Remove share link"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={handleShare}
                disabled={isSharing}
                size="sm"
                className="gap-2"
              >
                {isSharing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Sharing...</span>
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Share</span>
                  </>
                )}
              </Button>
            )
          )}

          {hasVersionHistory(prompt) && (
            <Button
              variant="outline"
              onClick={onShowVersions}
              size="sm"
              className="gap-2"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
            </Button>
          )}

          <Button
            variant="outline"
            onClick={onEdit}
            size="sm"
            className="gap-2"
          >
            <Edit className="h-4 w-4" />
            <span className="hidden sm:inline">Edit</span>
          </Button>

          {!prompt.isArchived && (
            <Button
              variant="outline"
              onClick={() => {
                onArchive();
                onOpenChange(false);
              }}
              size="sm"
              className="gap-2"
            >
              <Archive className="h-4 w-4" />
              <span className="hidden sm:inline">Archive</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}