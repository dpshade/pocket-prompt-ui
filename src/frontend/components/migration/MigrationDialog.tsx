/**
 * Migration dialog for importing encrypted Arweave prompts to Turso
 */
import { useState } from 'react';
import { ArrowRight, CheckCircle, AlertCircle, Loader2, KeyRound, Database } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/components/ui/dialog';
import {
  validatePassword,
  migrateToTurso,
  skipMigration,
  type MigrationResult,
  type MigrationStatus,
} from '@/core/migration/arweave-to-turso';

interface MigrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: MigrationStatus;
  onComplete: () => void;
}

type Step = 'intro' | 'password' | 'migrating' | 'success' | 'error';

export function MigrationDialog({ open, onOpenChange, status, onComplete }: MigrationDialogProps) {
  const [step, setStep] = useState<Step>('intro');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, title: '' });
  const [result, setResult] = useState<MigrationResult | null>(null);

  const handleSkip = () => {
    skipMigration();
    onOpenChange(false);
    onComplete();
  };

  const handleValidatePassword = async () => {
    if (!password.trim()) {
      setPasswordError('Please enter your encryption password');
      return;
    }

    setValidating(true);
    setPasswordError('');

    try {
      const isValid = await validatePassword(status.walletAddress!, password);
      if (isValid) {
        setStep('migrating');
        runMigration();
      } else {
        setPasswordError('Incorrect password. Please try again.');
      }
    } catch (error) {
      setPasswordError('Failed to validate password. Please try again.');
    } finally {
      setValidating(false);
    }
  };

  const runMigration = async () => {
    try {
      const migrationResult = await migrateToTurso(
        status.walletAddress!,
        password,
        (current, total, title) => {
          setProgress({ current, total, title });
        }
      );
      setResult(migrationResult);
      setStep(migrationResult.success ? 'success' : 'error');
    } catch (error) {
      setResult({
        success: false,
        promptsMigrated: 0,
        promptsFailed: status.promptCount,
        searchesMigrated: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
      setStep('error');
    }
  };

  const handleComplete = () => {
    onOpenChange(false);
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={step === 'migrating' ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 'intro' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Import Your Prompts
              </DialogTitle>
              <DialogDescription>
                We found {status.promptCount} prompt{status.promptCount !== 1 ? 's' : ''} from your previous setup
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                We've upgraded to a faster, more reliable backend. Your existing prompts can be imported automatically.
              </p>

              {status.hasEncryptedPrompts && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-700 dark:text-amber-300">
                      Encrypted prompts detected
                    </p>
                    <p className="text-amber-600/80 dark:text-amber-400/80">
                      You'll need to enter your encryption password to import them.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSkip} className="flex-1">
                Skip for now
              </Button>
              <Button
                onClick={() => status.hasEncryptedPrompts ? setStep('password') : runMigration()}
                className="flex-1 gap-2"
              >
                Import prompts
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {step === 'password' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Enter Encryption Password
              </DialogTitle>
              <DialogDescription>
                This is the password you used to encrypt your prompts
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Your encryption password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleValidatePassword()}
                  disabled={validating}
                />
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Your password is only used locally to decrypt your prompts.
                It is never sent to our servers.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('intro')} disabled={validating}>
                Back
              </Button>
              <Button onClick={handleValidatePassword} disabled={validating} className="flex-1 gap-2">
                {validating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'migrating' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Importing Prompts...
              </DialogTitle>
              <DialogDescription>
                Please don't close this window
              </DialogDescription>
            </DialogHeader>

            <div className="py-8 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{progress.current} / {progress.total}</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {progress.title && (
                <p className="text-sm text-center text-muted-foreground truncate">
                  {progress.title}
                </p>
              )}
            </div>
          </>
        )}

        {step === 'success' && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="h-5 w-5" />
                Import Complete!
              </DialogTitle>
            </DialogHeader>

            <div className="py-6 space-y-4">
              <div className="text-center space-y-1">
                <p className="text-3xl font-bold">{result.promptsMigrated}</p>
                <p className="text-sm text-muted-foreground">
                  prompt{result.promptsMigrated !== 1 ? 's' : ''} imported successfully
                </p>
              </div>

              {result.searchesMigrated > 0 && (
                <p className="text-sm text-center text-muted-foreground">
                  + {result.searchesMigrated} saved search{result.searchesMigrated !== 1 ? 'es' : ''}
                </p>
              )}
            </div>

            <Button onClick={handleComplete} className="w-full">
              Get Started
            </Button>
          </>
        )}

        {step === 'error' && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Import Partially Failed
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-3 rounded-lg bg-green-500/10">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {result.promptsMigrated}
                  </p>
                  <p className="text-xs text-muted-foreground">Imported</p>
                </div>
                <div className="p-3 rounded-lg bg-destructive/10">
                  <p className="text-2xl font-bold text-destructive">{result.promptsFailed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-1 p-2 rounded bg-muted">
                  {result.errors.slice(0, 5).map((error, i) => (
                    <p key={i}>• {error}</p>
                  ))}
                  {result.errors.length > 5 && (
                    <p>... and {result.errors.length - 5} more</p>
                  )}
                </div>
              )}
            </div>

            <Button onClick={handleComplete} className="w-full">
              Continue Anyway
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
