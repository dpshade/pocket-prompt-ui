import { useState, useRef } from 'react';
import { X, ExternalLink, Upload, FileKey, AlertTriangle, ArrowLeft } from 'lucide-react';
import {
  WanderWalletConnector,
  ArweaveAppWalletConnector,
  BeaconWalletConnector,
  KeyfileWalletConnector,
} from '@/backend/services/wallets';
import type { ArNSWalletConnector } from '@/shared/types/wallet';
import { WanderIcon, BeaconIcon, ArweaveAppIcon } from '@/frontend/components/icons';

interface ConnectWalletModalProps {
  open: boolean;
  onClose: () => void;
  onConnect: (connector: ArNSWalletConnector, address: string) => void;
}

/**
 * Wallet Connect Modal
 * Displays available wallet options for connecting to Arweave
 */
export function ConnectWalletModal({ open, onClose, onConnect }: ConnectWalletModalProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<'main' | 'keyfile'>('main');
  const [keyfileText, setKeyfileText] = useState('');
  const [keyfilePassword, setKeyfilePassword] = useState('');
  const [sessionOnly, setSessionOnly] = useState(false);
  const [importMethod, setImportMethod] = useState<'file' | 'text'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleConnect = async (walletConnector: ArNSWalletConnector, walletName: string) => {
    try {
      setConnecting(true);
      setError(null);

      // Connect to the wallet
      await walletConnector.connect();

      // Get the wallet address
      const address = await walletConnector.getWalletAddress();

      if (!address) {
        throw new Error('Failed to get wallet address');
      }

      // Notify parent component
      onConnect(walletConnector, address);
      onClose();
    } catch (err: any) {
      console.error(`${walletName} connection error:`, err);

      // User-friendly error messages
      let errorMessage = `Failed to connect to ${walletName}`;

      if (err.message?.includes('User cancelled') || err.message?.includes('cancel')) {
        errorMessage = 'Connection cancelled';
      } else if (err.message?.includes('not installed')) {
        errorMessage = `${walletName} is not installed. Please install the extension first.`;
      } else if (err.message?.includes('not responding')) {
        errorMessage = `${walletName} is not responding. Please check that it's running.`;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setConnecting(false);
    }
  };

  const handleKeyfileImport = async () => {
    try {
      setConnecting(true);
      setError(null);

      // Validate password
      if (!keyfilePassword || keyfilePassword.trim().length === 0) {
        throw new Error('Password is required to encrypt your keyfile');
      }

      // Create keyfile connector
      const connector = new KeyfileWalletConnector();

      // Import based on method
      if (importMethod === 'file') {
        // File upload
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
          throw new Error('Please select a keyfile to upload');
        }

        const text = await file.text();
        await connector.importFromJSON(text, keyfilePassword, sessionOnly);
      } else {
        // Raw text
        if (!keyfileText || keyfileText.trim().length === 0) {
          throw new Error('Please paste your keyfile JSON');
        }

        await connector.importFromJSON(keyfileText.trim(), keyfilePassword, sessionOnly);
      }

      // Connect
      await connector.connect();

      // Get address
      const address = await connector.getWalletAddress();

      if (!address) {
        throw new Error('Failed to get wallet address');
      }

      // Notify parent and close
      onConnect(connector, address);
      onClose();

      // Clear sensitive data
      setKeyfileText('');
      setKeyfilePassword('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Keyfile import error:', err);
      console.error('Error type:', err.constructor.name);
      console.error('Error stack:', err.stack);

      let errorMessage = 'Failed to import keyfile';
      if (err.message) {
        errorMessage = err.message;
      }

      // Add more context for debugging
      console.error('[ConnectWalletModal] Full error details:', {
        message: errorMessage,
        error: err,
        importMethod,
        hasFile: importMethod === 'file' ? !!fileInputRef.current?.files?.[0] : false,
        hasText: importMethod === 'text' ? keyfileText.length > 0 : false,
        hasPassword: keyfilePassword.length > 0,
      });

      setError(errorMessage);
    } finally {
      setConnecting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !connecting) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md rounded-lg border bg-card p-6 shadow-lg mx-4">
        {/* Header */}
        <div className="mb-4">
          {/* Back button for keyfile page */}
          {page === 'keyfile' && (
            <button
              onClick={() => setPage('main')}
              disabled={connecting}
              className="absolute top-4 left-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back</span>
            </button>
          )}

          <button
            onClick={onClose}
            disabled={connecting}
            className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>

          <h2 className="text-xl font-semibold mb-2">
            {page === 'main' ? 'Connect Wallet' : 'Import Keyfile'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {page === 'main'
              ? 'Choose a wallet to connect to Pocket Prompt'
              : 'Import an Arweave keyfile for mobile or advanced use'}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Main Page - Wallet Selection */}
        {page === 'main' && (
          <div className="space-y-3">
            {/* Wander Wallet */}
            <button
              onClick={() => handleConnect(new WanderWalletConnector(), 'Wander')}
              disabled={connecting}
              className="w-full flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-left transition-all hover:bg-accent hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex h-12 w-12 items-center justify-center">
                <WanderIcon className="h-full w-full" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Wander</div>
                <div className="text-xs text-muted-foreground">Browser extension wallet</div>
              </div>
              {connecting && <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />}
            </button>

            {/* Arweave.app Wallet */}
            <button
              onClick={() => handleConnect(new ArweaveAppWalletConnector(), 'Arweave.app')}
              disabled={connecting}
              className="w-full flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-left transition-all hover:bg-accent hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex h-12 w-12 items-center justify-center">
                <ArweaveAppIcon className="h-full w-full" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Arweave.app</div>
                <div className="text-xs text-muted-foreground">Web-based wallet</div>
              </div>
              {connecting && <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />}
            </button>

            {/* Beacon Wallet */}
            <button
              onClick={() => handleConnect(new BeaconWalletConnector(), 'Beacon')}
              disabled={connecting}
              className="w-full flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-left transition-all hover:bg-accent hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex h-12 w-12 items-center justify-center">
                <BeaconIcon className="h-full w-full" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Beacon</div>
                <div className="text-xs text-muted-foreground">Mobile-first wallet</div>
              </div>
              {connecting && <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />}
            </button>
          </div>
        )}

        {/* Keyfile Page */}
        {page === 'keyfile' && (
          <div className="space-y-4">
              {/* Security Warning */}
              <div className="flex gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  <strong>Security Warning:</strong> Keyfile import should only be used on trusted devices.
                  Your keyfile will be encrypted with your password and stored securely.
                </div>
              </div>

              {/* Import Method Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setImportMethod('file')}
                  disabled={connecting}
                  className={`flex-1 px-3 py-2 text-sm rounded-md border transition-all ${
                    importMethod === 'file'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent border-border'
                  }`}
                >
                  <Upload className="inline h-3 w-3 mr-1" />
                  Upload File
                </button>
                <button
                  onClick={() => setImportMethod('text')}
                  disabled={connecting}
                  className={`flex-1 px-3 py-2 text-sm rounded-md border transition-all ${
                    importMethod === 'text'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-accent border-border'
                  }`}
                >
                  <FileKey className="inline h-3 w-3 mr-1" />
                  Paste JSON
                </button>
              </div>

              {/* File Upload */}
              {importMethod === 'file' && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Arweave Keyfile (.json)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    disabled={connecting}
                    className="w-full text-sm border border-border rounded-md p-2 bg-background file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              )}

              {/* Text Input */}
              {importMethod === 'text' && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Keyfile JSON
                  </label>
                  <textarea
                    value={keyfileText}
                    onChange={(e) => setKeyfileText(e.target.value)}
                    disabled={connecting}
                    placeholder='Paste your keyfile JSON here (e.g., {"kty": "RSA", "n": "...", ...})'
                    className="w-full h-32 text-xs font-mono border border-border rounded-md p-2 bg-background resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              )}

              {/* Password Input */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Encryption Password
                </label>
                <input
                  type="password"
                  value={keyfilePassword}
                  onChange={(e) => setKeyfilePassword(e.target.value)}
                  disabled={connecting}
                  placeholder="Password to encrypt your keyfile"
                  className="w-full text-sm border border-border rounded-md p-2 bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Your keyfile will be encrypted with this password before storage
                </p>
              </div>

              {/* Session Only Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sessionOnly}
                  onChange={(e) => setSessionOnly(e.target.checked)}
                  disabled={connecting}
                  className="w-4 h-4 rounded border-border disabled:cursor-not-allowed"
                />
                <span className="text-sm">Session only (don't save keyfile)</span>
              </label>

              {/* Import Button */}
              <button
                onClick={handleKeyfileImport}
                disabled={connecting || !keyfilePassword}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-primary text-primary-foreground p-3 text-sm font-medium transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                    Importing...
                  </>
                ) : (
                  <>
                    <FileKey className="h-4 w-4" />
                    Import Keyfile
                  </>
                )}
              </button>
            </div>
        )}

        {/* Advanced Options Button (Main Page Only) */}
        {page === 'main' && (
          <div className="mt-6 pt-4 border-t">
            <button
              onClick={() => {
                setError(null);
                setPage('keyfile');
              }}
              disabled={connecting}
              className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <FileKey className="h-4 w-4" />
              <span>Advanced: Import Keyfile</span>
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Don't have a wallet?{' '}
            <a
              href="https://ar.io/wallet"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Get one here
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
