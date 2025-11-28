import { useState } from "react";
import { Rocket, Cloud, Package, Check } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/frontend/components/ui/dialog";

interface ComingSoonButtonProps {
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ComingSoonButton({
  className,
  open: controlledOpen,
  onOpenChange,
}: ComingSoonButtonProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Support both controlled and uncontrolled modes
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interests, setInterests] = useState({ sync: false, packs: false });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (!interests.sync && !interests.packs) return;

    setLoading(true);

    const selectedInterests = [];
    if (interests.sync) selectedInterests.push("sync");
    if (interests.packs) selectedInterests.push("packs");
    console.log("[Waitlist] Interest:", email, selectedInterests);

    await new Promise((resolve) => setTimeout(resolve, 500));

    setSubmitted(true);
    setLoading(false);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSubmitted(false);
      setEmail("");
      setInterests({ sync: false, packs: false });
    }, 200);
  };

  const toggleInterest = (key: "sync" | "packs") => {
    setInterests((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      <Button
        variant="ghost"
        className={`h-8 w-8 p-0 ${className}`}
        onClick={() => setOpen(true)}
      >
        <Rocket className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Coming Soon
            </DialogTitle>
            <DialogDescription>What features interest you?</DialogDescription>
          </DialogHeader>

          {submitted ? (
            <div className="px-6 py-8 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">You're on the list!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  We'll notify you when these features launch.
                </p>
              </div>
              <Button onClick={handleClose} variant="outline" className="mt-4">
                Close
              </Button>
            </div>
          ) : (
            <div className="px-6 pb-6 space-y-4">
              <div className="space-y-2">
                <FeatureOption
                  checked={interests.sync}
                  onCheckedChange={() => toggleInterest("sync")}
                  icon={<Cloud className="h-4 w-4" />}
                  title="Cloud Sync"
                  description="Access prompts from any device"
                />
                <FeatureOption
                  checked={interests.packs}
                  onCheckedChange={() => toggleInterest("packs")}
                  icon={<Package className="h-4 w-4" />}
                  title="Prompt Packs"
                  description="Bundle and share collections"
                />
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || (!interests.sync && !interests.packs)}
                >
                  {loading ? "Joining..." : "Join Waitlist"}
                </Button>
              </form>

              <p className="text-xs text-center text-muted-foreground">
                Select at least one feature. No spam.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FeatureOption({
  checked,
  onCheckedChange,
  icon,
  title,
  description,
}: {
  checked: boolean;
  onCheckedChange: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      onClick={onCheckedChange}
      className="flex items-center gap-3 py-2 cursor-pointer group"
    >
      <div
        className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          checked
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/40 group-hover:border-primary/60"
        }`}
      >
        {checked && <Check className="h-3 w-3" />}
      </div>
      <div
        className={`p-1.5 rounded-md transition-colors ${checked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
