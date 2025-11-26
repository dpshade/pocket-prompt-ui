import { memo } from 'react';
import type { HTMLAttributes } from 'react';
import { ExternalLink, Edit, Archive, ArchiveRestore, Check, Lock, Globe, Info } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Badge } from '@/frontend/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/frontend/components/ui/tooltip';
import type { Prompt } from '@/shared/types/prompt';
import { wasPromptEncrypted } from '@/core/encryption/crypto';
import { cn } from '@/shared/utils/cn';

interface PromptListItemProps extends HTMLAttributes<HTMLDivElement> {
  prompt: Prompt;
  isCopied?: boolean;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onCopyPrompt: (id: string) => void;
  variant?: 'card' | 'pane';
  'data-selected'?: boolean;
}

export const PromptListItem = memo(function PromptListItem({ prompt, isCopied = false, onView, onEdit, onArchive, onRestore, onCopyPrompt, variant = 'card', className, 'data-selected': isSelected = false, ...rest }: PromptListItemProps) {
  const isEncrypted = wasPromptEncrypted(prompt.tags);
  const isPublic = !isEncrypted;

  const handleCopy = () => {
    onCopyPrompt(prompt.id);
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

  const containerClass = variant === 'pane'
    ? cn(
        'group relative border-b border-border py-5 px-5 sm:py-4 sm:px-4 md:hover:bg-muted/50 transition-colors cursor-pointer overflow-hidden',
        !isCopied && isSelected
          ? 'bg-primary/3 border-l-4 border-l-primary'
          : '',
        className,
      )
    : cn(
        'group relative bg-card rounded-3xl sm:rounded-2xl py-5 px-5 sm:py-4 sm:px-5 cursor-pointer overflow-hidden shadow-sm md:hover:shadow-lg border border-border',
        !isCopied && isSelected ? 'ring-2 ring-primary shadow-lg' : '',
        className,
      );

  return (
    <div
      className={containerClass}
      onClick={handleCopy}
      title="Click to copy"
      {...rest}
    >
      {/* Copy overlay */}
      {isCopied && (
        <div
          className="absolute inset-0 bg-primary/25 backdrop-blur-[2px] z-10 flex items-center justify-center"
          style={{
            animation: 'fadeIn 0.15s ease-in, fadeOut 0.25s ease-out 1s forwards'
          }}
        >
          <div className="flex items-center gap-3">
            <Check className="h-8 w-8 text-primary animate-in zoom-in duration-300" />
            <span className="text-base font-medium text-primary">Copied!</span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        {/* Top Section: Icon + Content */}
        <div className="flex items-start gap-2 sm:gap-4 flex-1 min-w-0">
          {/* Left: Icon - hidden on mobile for cleaner look */}
          <div className="hidden sm:flex flex-shrink-0 pt-1">
            <span title={isPublic ? "Public prompt" : "Encrypted prompt"}>
              {isPublic ? (
                <Globe className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Lock className="h-5 w-5 text-muted-foreground" />
              )}
            </span>
          </div>

          {/* Center: Content */}
          <div className="flex-1 min-w-0 space-y-2.5 sm:space-y-2 sm:pr-32">
            {/* Title */}
            <div className="flex items-center gap-2">
              {/* Show icon inline on mobile */}
              <span className="sm:hidden flex-shrink-0" title={isPublic ? "Public prompt" : "Encrypted prompt"}>
                {isPublic ? (
                  <Globe className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
              <h3 className="text-base font-semibold sm:text-base sm:font-medium text-primary [@media(hover:hover)]:hover:underline truncate">
                {prompt.title}
              </h3>
            </div>

            {/* Description */}
            {getDisplayDescription() && (
              <p className="text-[15px] sm:text-sm text-muted-foreground/80 line-clamp-2 sm:line-clamp-1 leading-relaxed">
                {getDisplayDescription()}
              </p>
            )}

            {/* Tags */}
            {prompt.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 sm:gap-1.5 pt-1">
                {prompt.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[13px] sm:text-xs px-2.5 sm:px-2 py-1 sm:py-0.5">
                    {tag}
                  </Badge>
                ))}
                {prompt.tags.length > 3 && (
                  <Badge variant="outline" className="text-[13px] sm:text-xs px-2.5 sm:px-2 py-1 sm:py-0.5">
                    +{prompt.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions - Horizontal Bottom (Mobile), Horizontal Bottom Right (Desktop) */}
        <div className={cn(
          'flex sm:absolute flex-row gap-2 sm:gap-1 sm:top-auto sm:translate-y-0 sm:bottom-4 sm:right-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity pt-2 sm:pt-0 p-0 sm:p-1 w-full sm:w-auto',
          variant === 'pane'
            ? 'bg-muted/50 rounded-2xl sm:bg-transparent sm:rounded-none'
            : 'sm:bg-background sm:border sm:rounded-2xl sm:shadow-sm'
        )}>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onView(prompt.id);
                }}
                className="h-9 flex-1 sm:flex-initial sm:h-10 sm:w-10 md:h-8 md:w-8 p-0 active:scale-95 transition-transform"
              >
                <ExternalLink className="h-4 w-4 sm:h-[18px] sm:w-[18px] md:h-3.5 md:w-3.5" />
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
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(prompt.id);
                    }}
                    className="h-9 flex-1 sm:flex-initial sm:h-10 sm:w-10 md:h-8 md:w-8 p-0 active:scale-95 transition-transform"
                  >
                    <Edit className="h-4 w-4 sm:h-[18px] sm:w-[18px] md:h-3.5 md:w-3.5" />
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
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchive(prompt.id);
                    }}
                    className="h-9 flex-1 sm:flex-initial sm:h-10 sm:w-10 md:h-8 md:w-8 p-0 active:scale-95 transition-transform"
                  >
                    <Archive className="h-4 w-4 sm:h-[18px] sm:w-[18px] md:h-3.5 md:w-3.5" />
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
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore(prompt.id);
                  }}
                  className="h-9 flex-1 sm:flex-initial sm:h-10 sm:w-10 md:h-8 md:w-8 p-0 active:scale-95 transition-transform"
                >
                  <ArchiveRestore className="h-4 w-4 sm:h-[18px] sm:w-[18px] md:h-3.5 md:w-3.5" />
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
                variant="ghost"
                onClick={(e) => e.stopPropagation()}
                className="h-9 flex-1 sm:flex-initial sm:h-10 sm:w-10 md:h-8 md:w-8 p-0 active:scale-95 transition-transform"
              >
                <Info className="h-4 w-4 sm:h-[18px] sm:w-[18px] md:h-3.5 md:w-3.5" />
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
      </div>
      </div>
    </div>
  );
});
