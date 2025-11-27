import { useState } from "react";
import {
  Cloud,
  Database,
  Folder,
  Sparkles,
  Check,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/frontend/components/ui/dialog";
import { Input } from "@/frontend/components/ui/input";
import { type SyncMode, SYNC_MODES } from "@/shared/types/sync";
import { useSyncModeStatus, useSyncMode } from "@/frontend/hooks/useSyncMode";

export function SyncButton() {
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<SyncMode | null>(null);

  const syncStatus = useSyncModeStatus();
  const { switchMode, attachDirectory } = useSyncMode();

  const handleClick = () => {
    setShowModal(true);
    setSelectedMode(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);

    // Log for validation - in production, send to backend/Typeform
    console.log("[Waitlist] Cloud Sync interest:", email);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));

    setSubmitted(true);
    setLoading(false);
  };

  const handleClose = () => {
    setShowModal(false);
    setTimeout(() => {
      setSubmitted(false);
      setEmail("");
      setSelectedMode(null);
    }, 200);
  };

  const handleModeSelect = async (mode: SyncMode) => {
    if (mode === "attached-directory") {
      // Force directory selection for attached directory mode
      const success = await attachDirectory();
      if (success) {
        setSelectedMode(mode);
        // Reload page to apply the new mode
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } else if (mode === "cloud-sync") {
      // Show waitlist for cloud sync
      setSelectedMode(mode);
    } else {
      // Simple mode switch for app-only
      const success = await switchMode(mode);
      if (success) {
        setSelectedMode(mode);
        // Reload to apply new mode
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    }
  };

  const getModeIcon = (iconName: string) => {
    switch (iconName) {
      case "database":
        return <Database className="h-5 w-5" />;
      case "folder":
        return <Folder className="h-5 w-5" />;
      case "cloud":
        return <Cloud className="h-5 w-5" />;
      default:
        return <Cloud className="h-5 w-5" />;
    }
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={handleClick}>
        <RotateCcw className="h-5 w-5" />
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Choose Sync Mode</DialogTitle>
            <DialogDescription>
              Select how your prompts are stored and synced
            </DialogDescription>
          </DialogHeader>

          {selectedMode === "cloud-sync" && submitted ? (
            <div className="py-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
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
          ) : selectedMode === "cloud-sync" ? (
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
                  Cloud sync is coming soon! Join the waitlist to get early
                  access.
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
                  {loading ? "Joining..." : "Get Early Access"}
                </Button>
              </form>

              <p className="text-xs text-center text-muted-foreground">
                Be first to know when Cloud Sync launches. No spam.
              </p>
            </div>
          ) : (
            <div className="space-y-4 px-6 pb-6">
              {(
                Object.entries(SYNC_MODES) as [
                  SyncMode,
                  (typeof SYNC_MODES)[SyncMode],
                ][]
              ).map(([mode, config]) => {
                const isCurrentMode = mode === syncStatus.mode;
                const isAttaching =
                  syncStatus.isSwitching && mode === "attached-directory";

                return (
                  <div
                    key={mode}
                    className={`
                      relative rounded-lg border p-4 cursor-pointer transition-all
                      ${
                        isCurrentMode
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-muted/30"
                      }
                      ${!config.available ? "opacity-50 cursor-not-allowed" : ""}
                    `}
                    onClick={() =>
                      config.available &&
                      !isCurrentMode &&
                      handleModeSelect(mode)
                    }
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`
                        mt-0.5 p-2 rounded-lg
                        ${
                          isCurrentMode
                            ? "bg-primary text-primary-foreground"
                            : "bg-primary/10 text-primary"
                        }
                      `}
                      >
                        {getModeIcon(config.icon)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{config.name}</h3>
                          {isCurrentMode && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                              Current
                            </span>
                          )}
                          {!config.available && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              Coming Soon
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {config.description}
                        </p>

                        {mode === "attached-directory" &&
                          syncStatus.attachedDirectory && (
                            <p className="text-xs text-muted-foreground mt-2">
                              <pre>{syncStatus.attachedDirectory}</pre>
                            </p>
                          )}

                        {isAttaching && (
                          <div className="flex items-center gap-2 mt-2 text-sm text-primary">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            Selecting directory...
                          </div>
                        )}
                      </div>
                    </div>

                    {!config.available && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
                        <div className="text-center">
                          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Coming Soon
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {syncStatus.error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-destructive">
                      {syncStatus.error}
                    </p>
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground text-center pt-2">
                Switching sync modes will reload the app to apply changes.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
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
