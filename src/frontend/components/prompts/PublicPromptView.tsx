/**
 * PublicPromptView - Display a public prompt by Arweave TxID without wallet connection
 */

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, ArrowLeft } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Badge } from '@/frontend/components/ui/badge';
import { WalletButton } from '@/frontend/components/wallet/WalletButton';
import { UploadDialog } from '@/frontend/components/shared/UploadDialog';
import { PasswordUnlock } from '@/frontend/components/wallet/PasswordUnlock';
import type { Prompt } from '@/shared/types/prompt';
import type { FileImportResult } from '@/shared/utils/import';
import type { EncryptedData } from '@/core/encryption/crypto';
import { fetchPrompt } from '@/backend/api/client';
import { getPublicPromptShareLink } from '@/frontend/utils/deepLinks';
import { useWallet } from '@/frontend/hooks/useWallet';
import { usePassword } from '@/frontend/contexts/PasswordContext';
import { usePrompts } from '@/frontend/hooks/usePrompts';

interface PublicPromptViewProps {
  txId: string;
  onBack: () => void;
}

export function PublicPromptView({ txId, onBack }: PublicPromptViewProps) {
  const { connected } = useWallet();
  const { password, setPassword: setPasswordContext } = usePassword();
  const { addPrompt, prompts } = usePrompts();

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [passwordUnlockOpen, setPasswordUnlockOpen] = useState(false);
  const [sampleEncryptedData, setSampleEncryptedData] = useState<EncryptedData | null>(null);

  useEffect(() => {
    async function loadPrompt() {
      try {
        setLoading(true);
        setError(null);

        // Fetch prompt without password (public prompts only)
        const fetchedPrompt = await fetchPrompt(txId);

        if (!fetchedPrompt) {
          throw new Error('Prompt not found or is not public');
        }

        // Check if content is a string (public) or encrypted object
        if (typeof fetchedPrompt.content !== 'string') {
          throw new Error('This prompt is encrypted and cannot be viewed publicly');
        }

        setPrompt(fetchedPrompt);
      } catch (err) {
        console.error('Failed to load public prompt:', err);
        setError(err instanceof Error ? err.message : 'Failed to load prompt');
      } finally {
        setLoading(false);
      }
    }

    loadPrompt();
  }, [txId]);

  const handleCopy = () => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareLink = () => {
    const shareUrl = getPublicPromptShareLink(txId);
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleSaveToLibrary = () => {
    if (!prompt || !connected) return;

    // Check if we have encrypted prompts but no password
    const hasEncryptedPrompts = prompts.some(p => typeof p.content !== 'string');

    if (hasEncryptedPrompts && !password) {
      // Get a sample encrypted prompt for password validation
      const encryptedPrompt = prompts.find(p => typeof p.content !== 'string');
      if (encryptedPrompt && typeof encryptedPrompt.content !== 'string') {
        setSampleEncryptedData(encryptedPrompt.content);
        setPasswordUnlockOpen(true);
      }
    } else {
      // Have password or no encrypted prompts - proceed directly to upload dialog
      setUploadDialogOpen(true);
    }
  };

  const handlePasswordUnlock = (validatedPassword: string) => {
    setPasswordContext(validatedPassword);
    setPasswordUnlockOpen(false);
    // Now show upload dialog with password available
    setUploadDialogOpen(true);
  };

  const handleImport = async (selectedPrompts: FileImportResult[]) => {
    // Import selected prompts
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
        }, password || undefined);
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!prompt) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Don't handle shortcuts when typing
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
          <div className="flex items-center justify-between w-full mx-auto">
            <h1 className="flex items-center gap-2.5 sm:gap-2 text-lg font-bold sm:text-xl md:text-2xl">
              <img src="/logo.svg" alt="Pocket Prompt Logo" className="h-6 w-6 sm:h-6 sm:w-6" />
              <span>Pocket Prompt</span>
            </h1>
            <WalletButton />
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
            <p className="mt-4 text-muted-foreground animate-pulse">Loading prompt...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 space-y-4">
            <div className="text-destructive text-lg font-medium">{error}</div>
            <p className="text-muted-foreground">
              This prompt may be private or the transaction ID may be invalid.
            </p>
            <Button onClick={onBack} variant="outline">
              Go Back
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
                  <Badge variant="default" className="shrink-0">
                    Public
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
                <div>
                  Arweave TxID:{' '}
                  <a
                    href={`https://viewblock.io/arweave/tx/${txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {txId.slice(0, 8)}...{txId.slice(-8)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
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

                {connected && (
                  <Button
                    variant="default"
                    onClick={handleSaveToLibrary}
                  >
                    Save to My Library
                  </Button>
                )}
              </div>
            </div>

            {/* Info Box */}
            <div className="border border-border/50 rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
              <p>
                This is a public prompt stored permanently on the Arweave blockchain.
                {connected
                  ? ' Click "Save to My Library" to add this prompt to your personal collection.'
                  : ' Connect your wallet to save this to your library and access your private prompts.'
                }
              </p>
              <p className="text-xs">
                <strong>Keyboard shortcut:</strong> Press <kbd className="px-1.5 py-0.5 text-xs bg-background border rounded">C</kbd> to copy
              </p>
            </div>
          </div>
        ) : null}
      </main>

      {/* Password Unlock Dialog - shown first if encrypted prompts exist */}
      <PasswordUnlock
        open={passwordUnlockOpen}
        sampleEncryptedData={sampleEncryptedData}
        onPasswordUnlock={handlePasswordUnlock}
        onCancel={() => setPasswordUnlockOpen(false)}
      />

      {/* Upload Dialog for Save to Library with duplicate checking */}
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
                id: prompt.id,
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
