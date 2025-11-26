import { useState } from 'react';
import { Package, Share2, FolderOpen, Sparkles } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/components/ui/dialog';

interface PacksWaitlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PacksWaitlistModal({ open, onOpenChange }: PacksWaitlistModalProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);

    // For now, just log and show success
    // TODO: Connect to Typeform/Tally or your backend
    console.log('[Waitlist] Packs interest:', email);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));

    setSubmitted(true);
    setLoading(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after animation completes
    setTimeout(() => {
      setSubmitted(false);
      setEmail('');
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Package className="h-5 w-5" />
            Prompt Packs
          </DialogTitle>
          <DialogDescription>
            Bundle and share collections of related prompts
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
                We'll notify you when Packs launches.
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
                icon={<FolderOpen className="h-4 w-4" />}
                title="Bundle Related Prompts"
                description="Group prompts by project, workflow, or topic"
              />
              <Feature
                icon={<Share2 className="h-4 w-4" />}
                title="Share with One Link"
                description="Let others import your entire pack instantly"
              />
              <Feature
                icon={<Sparkles className="h-4 w-4" />}
                title="Discover Community Packs"
                description="Browse and use packs created by others"
              />
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
              Be first to know when Packs launches. No spam.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Keep old export for backwards compatibility
export { PacksWaitlistModal as TeamsWaitlistModal };

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
