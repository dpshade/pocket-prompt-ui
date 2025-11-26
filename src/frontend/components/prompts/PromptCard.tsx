import { ExternalLink, Edit, Archive, ArchiveRestore, Check, Lock, Globe, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/frontend/components/ui/card';
import { Button } from '@/frontend/components/ui/button';
import { Badge } from '@/frontend/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/frontend/components/ui/tooltip';
import type { Prompt } from '@/shared/types/prompt';
import { wasPromptEncrypted } from '@/core/encryption/crypto';

interface PromptCardProps {
  prompt: Prompt;
  isSelected?: boolean;
  isCopied?: boolean;
  onView: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onCopy: () => void;
}

export function PromptCard({ prompt, isSelected = false, isCopied = false, onView, onEdit, onArchive, onRestore, onCopy }: PromptCardProps) {
  const isEncrypted = wasPromptEncrypted(prompt.tags);
  const isPublic = !isEncrypted;

  const handleCopy = () => {
    onCopy();
  };

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} · ${hours}:${minutes}`;
  };

  const getDisplayDescription = () => {
    if (prompt.description) {
      return prompt.description;
    }
    // If no description, use truncated content
    if (typeof prompt.content === 'string') {
      return prompt.content;
    }
    return '';
  };

  return (
    <Card
      className={`group cursor-pointer md:hover:shadow-lg md:hover:-translate-y-1 transition-all duration-200 active:scale-[0.98] h-[240px] flex flex-col relative ${!isCopied && isSelected ? 'ring-2 ring-primary shadow-lg -translate-y-1' : ''}`}
      onClick={handleCopy}
      title="Click to copy"
    >
      {/* Copy overlay */}
      {isCopied && (
        <div
          className="absolute inset-0 bg-primary/25 backdrop-blur-[2px] rounded-lg z-10 flex items-center justify-center"
          style={{
            animation: 'fadeIn 0.15s ease-in, fadeOut 0.25s ease-out 1s forwards'
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <Check className="h-12 w-12 text-primary animate-in zoom-in duration-300" />
            <span className="text-sm font-medium text-primary">Copied!</span>
          </div>
        </div>
      )}

      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm truncate">{prompt.title}</CardTitle>
              <span title={isPublic ? "Public prompt" : "Encrypted prompt"}>
                {isPublic ? (
                  <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                ) : (
                  <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                )}
              </span>
            </div>
            {getDisplayDescription() && (
              <CardDescription className="line-clamp-2 mt-0.5 text-xs">
                {getDisplayDescription()}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pt-2 pb-3 flex-1 flex flex-col min-h-0">
        {/* Tags */}
        {prompt.tags.length > 0 && (
          <div className="relative" style={{ maxHeight: '2.625rem' }}>
            <div className="flex flex-wrap gap-1">
              {prompt.tags.slice(0, 6).map((tag, index) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-xs h-5 px-1.5 flex-shrink-0"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {tag}
                </Badge>
              ))}
              {prompt.tags.length > 6 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5 flex-shrink-0">
                  +{prompt.tags.length - 6}
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 px-5 py-4 mt-auto">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onView();
                }}
                className="md:hover:scale-110 active:scale-90 transition-transform h-8 w-8 md:h-7 md:w-auto"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Open prompt</p>
            </TooltipContent>
          </Tooltip>

          {!prompt.isArchived ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    className="md:hover:scale-110 active:scale-90 transition-transform h-8 w-8 md:h-7 md:w-auto"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Edit</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchive();
                    }}
                    className="md:hover:scale-110 active:scale-90 transition-transform h-8 w-8 md:h-7 md:w-auto"
                  >
                    <Archive className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Archive</p>
                </TooltipContent>
              </Tooltip>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore();
                  }}
                  className="md:hover:scale-110 active:scale-90 transition-transform animate-wiggle h-8 w-8 md:h-7 md:w-auto"
                >
                  <ArchiveRestore className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Restore</p>
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => e.stopPropagation()}
                className="md:hover:scale-110 active:scale-90 transition-transform h-8 w-8 md:h-7 md:w-auto ml-auto"
              >
                <Info className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" align="end" className="text-xs p-3">
              <div className="space-y-1.5 min-w-[160px]">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">{formatDateTime(prompt.createdAt)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Updated</span>
                  <span className="font-medium">{formatDateTime(prompt.updatedAt)}</span>
                </div>
                {!prompt.isSynced && (
                  <>
                    <div className="border-t border-border my-1"></div>
                    <div className="text-yellow-500 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                      <span className="text-[11px]">Not synced to Arweave</span>
                    </div>
                  </>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardFooter>
    </Card>
  );
}