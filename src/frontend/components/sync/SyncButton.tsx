import { useState } from 'react';
import { Cloud, Sparkles } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/components/ui/dialog';
import { Input } from '@/frontend/components/ui/input';

// Track sync button clicks in localStorage for validation
const SYNC_CLICKS_KEY = 'pv_sync_intent_clicks';

function trackSyncClick(): number {
  const current = parseInt(localStorage.getItem(SYNC_CLICKS_KEY) || '0', 10);
  const newCount = current + 1;
  localStorage.setItem(SYNC_CLICKS_KEY, String(newCount));
  console.log('[Validation] Sync intent clicked. Total:', newCount);
  return newCount;
}

export function SyncButton() {
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    trackSyncClick();
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);

    // Log for validation - in production, send to backend/Typeform
    console.log('[Waitlist] Cloud Sync interest:', email);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));

    setSubmitted(true);
    setLoading(false);
  };

  const handleClose = () => {
    setShowModal(false);
    setTimeout(() => {
      setSubmitted(false);
      setEmail('');
    }, 200);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        className="gap-2 h-10 px-3 opacity-60 hover:opacity-80"
      >
        <Cloud className="h-4 w-4" />
        <span className="hidden sm:inline">Sync</span>
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Cloud className="h-5 w-5" />
              Cloud Sync
            </DialogTitle>
            <DialogDescription>
              Access your prompts from any device
            </DialogDescription>
          </DialogHeader>

          {submitted ? (
            <div className="py-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-lg">You're on the list!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  We'll notify you when Cloud Sync launches.
                </p>
              </div>
              <Button onClick={handleClose} variant="outline" className="mt-4">
                Close
              </Button>
            </div>
          ) : (
            <div className="space-y-6 px-6 pb-6">
              <div className="space-y-3">
                <Feature
                  icon={<Cloud className="h-4 w-4" />}
                  title="Sync Across Devices"
                  description="Your prompts, everywhere you work"
                />
                <Feature
                  icon={<Sparkles className="h-4 w-4" />}
                  title="Automatic Backup"
                  description="Never lose your carefully crafted prompts"
                />
              </div>

              <div className="rounded-lg bg-muted/50 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Cloud sync is coming soon! Join the waitlist to get early access.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full"
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Joining...' : 'Get Early Access'}
                </Button>
              </form>

              <p className="text-xs text-center text-muted-foreground">
                Be first to know when Cloud Sync launches. No spam.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 p-2 rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <h4 className="font-medium text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
