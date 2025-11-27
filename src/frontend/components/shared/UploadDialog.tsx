import { useState, useRef, useEffect } from 'react';
import type { DragEvent } from 'react';
import { Upload, FolderUp, FileText, CheckCircle, AlertCircle, Copy, Download, Link, Unlink, FolderSync, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/frontend/components/ui/dialog';
import { Button } from '@/frontend/components/ui/button';
import { Badge } from '@/frontend/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/frontend/components/ui/tabs';
import { importMarkdownDirectory, type FileImportResult } from '@/shared/utils/import';
import type { Prompt } from '@/shared/types/prompt';
import { usePrompts } from '@/frontend/hooks/usePrompts';

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (selectedPrompts: FileImportResult[]) => Promise<void>;
  existingPromptIds: string[];
  existingPrompts: Prompt[];
  initialPrompts?: FileImportResult[]; // Optional: Pre-populate with prompts (e.g., from public view)
}

// Convert a prompt to Obsidian-compatible markdown with frontmatter
function promptToMarkdown(prompt: Prompt): string {
  const frontmatter = [
    '---',
    `id: ${prompt.id}`,
    `title: "${prompt.title.replace(/"/g, '\\"')}"`,
  ];

  if (prompt.description) {
    frontmatter.push(`description: "${prompt.description.replace(/"/g, '\\"')}"`);
  }

  if (prompt.tags.length > 0) {
    frontmatter.push(`tags:`);
    prompt.tags.forEach(tag => {
      frontmatter.push(`  - ${tag}`);
    });
  }

  frontmatter.push(`created: ${new Date(prompt.createdAt).toISOString()}`);
  frontmatter.push(`updated: ${new Date(prompt.updatedAt).toISOString()}`);
  frontmatter.push('---');
  frontmatter.push('');
  frontmatter.push(prompt.content);

  return frontmatter.join('\n');
}

// Sanitize filename for filesystem
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100); // Limit length
}

export function UploadDialog({ open, onOpenChange, onImport, existingPromptIds, existingPrompts, initialPrompts }: UploadDialogProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preview, setPreview] = useState<FileImportResult[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'attach'>('import');
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [hasInitializedExport, setHasInitializedExport] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Directory mode state from usePrompts
  const { directoryMode, attachedDirectory, attachDirectory, detachDirectory, loadPrompts, resetAllData } = usePrompts();

  // Auto-select all prompts for export when first switching to export tab
  useEffect(() => {
    if (activeTab === 'export' && existingPrompts.length > 0 && !hasInitializedExport) {
      setExportSelectedIds(new Set(existingPrompts.filter(p => !p.isArchived).map(p => p.id)));
      setHasInitializedExport(true);
    }
  }, [activeTab, existingPrompts, hasInitializedExport]);

  const handleExportSelected = async () => {
    if (exportSelectedIds.size === 0) return;

    setIsExporting(true);

    try {
      const selectedPrompts = existingPrompts.filter(p => exportSelectedIds.has(p.id));

      if (selectedPrompts.length === 1) {
        // Single file export
        const prompt = selectedPrompts[0];
        const markdown = promptToMarkdown(prompt);
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFilename(prompt.title)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Multiple files - create a ZIP
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();

        selectedPrompts.forEach(prompt => {
          const markdown = promptToMarkdown(prompt);
          const filename = `${sanitizeFilename(prompt.title)}.md`;
          zip.file(filename, markdown);
        });

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pocket-prompt-export-${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleExportSelection = (id: string) => {
    const newSelection = new Set(exportSelectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setExportSelectedIds(newSelection);
  };

  const selectAllForExport = () => {
    setExportSelectedIds(new Set(existingPrompts.filter(p => !p.isArchived).map(p => p.id)));
  };

  const deselectAllForExport = () => {
    setExportSelectedIds(new Set());
  };

  // Handle initial prompts (e.g., from public prompt view)
  useEffect(() => {
    if (open && initialPrompts && initialPrompts.length > 0) {
      setPreview(initialPrompts);
      // Auto-select all initially provided prompts
      const validIds = new Set(
        initialPrompts
          .filter(r => r.success && r.prompt)
          .map(r => r.prompt!.id)
      );
      setSelectedIds(validIds);
    }
  }, [open, initialPrompts]);

  const resetState = () => {
    setPreview(null);
    setSelectedIds(new Set());
    setDuplicateIds(new Set());
    setIsProcessing(false);
    setActiveTab('import');
    setHasInitializedExport(false);
    setExportSelectedIds(new Set());
    setIsAttaching(false);
    setShowDetachConfirm(false);
    setShowResetConfirm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleAttachDirectory = async () => {
    setIsAttaching(true);
    try {
      const path = await attachDirectory();
      if (path) {
        // Reload prompts after attaching
        await loadPrompts();
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Failed to attach directory:', error);
    } finally {
      setIsAttaching(false);
    }
  };

  const [showDetachConfirm, setShowDetachConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleDetachDirectory = () => {
    setShowDetachConfirm(true);
  };

  const handleSyncDirectory = async () => {
    if (!attachedDirectory) return;
    
    setIsSyncing(true);
    try {
      // Re-read all files from directory using directory storage
      const { readPromptsFromDirectory } = await import('@/backend/api/directory-storage');
      const prompts = await readPromptsFromDirectory(attachedDirectory);
      
      // Update FlexSearch index
      const { indexPrompts } = await import('@/core/search');
      indexPrompts(prompts);
      
      // Update prompts in state
      const { set: setPrompts } = usePrompts.getState();
      setPrompts({ prompts, directorySyncing: false });
      
      // Sync to Turso if needed
      try {
        const deviceId = await (await import('@/core/identity/device')).getDeviceId();
        const { getOrCreateUser, createPrompt } = await import('@/backend/api/turso-queries');
        const user = await getOrCreateUser(deviceId);
        
        for (const prompt of prompts) {
          await createPrompt(user.id, {
            id: prompt.id,
            title: prompt.title,
            description: prompt.description,
            content: prompt.content,
            tags: prompt.tags,
            createdAt: prompt.createdAt,
            updatedAt: prompt.updatedAt,
          });
        }
      } catch (tursoError) {
        console.warn('Failed to sync to Turso (continuing anyway):', tursoError);
      }
    } catch (error) {
      console.error('Failed to sync directory:', error);
      alert(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const confirmDetachDirectory = async () => {
    setShowDetachConfirm(false);
    detachDirectory();
    // Reload prompts from database (will be empty unless they have some in Turso)
    await loadPrompts();
  };

  const handleResetData = () => {
    setShowResetConfirm(true);
  };

  const confirmResetData = async () => {
    setShowResetConfirm(false);
    // Reset all data (Turso, FlexSearch, localStorage, directory)
    await resetAllData();
    // Close dialog
    onOpenChange(false);
  };

  // Detect duplicates when preview changes
  useEffect(() => {
    if (!preview) return;

    const detectDuplicates = () => {
      // Extract prompts from preview
      const importedPrompts: Prompt[] = [];
      for (const result of preview) {
        if (result.success && result.prompt) {
          // Convert ImportedPrompt to Prompt for duplicate detection
          const fullPrompt: Prompt = {
            ...result.prompt,
            currentTxId: '',
            versions: [],
            isArchived: false,
            isSynced: false,
            createdAt: result.prompt.createdAt || Date.now(),
            updatedAt: result.prompt.updatedAt || Date.now(),
          };
          importedPrompts.push(fullPrompt);
        }
      }

      // Check for duplicates based on title matching
      if (existingPrompts.length > 0 && importedPrompts.length > 0) {
        const duplicateSet = new Set<string>();

        importedPrompts.forEach(imported => {
          // Check if any existing prompt has the same title
          const isDuplicate = existingPrompts.some(existing => {
            const importedTitle = imported.title.trim().toLowerCase();
            const existingTitle = existing.title.trim().toLowerCase();
            return importedTitle === existingTitle;
          });

          if (isDuplicate) {
            duplicateSet.add(imported.id);
          }
        });

        setDuplicateIds(duplicateSet);
      } else {
        setDuplicateIds(new Set());
      }
    };

    detectDuplicates();
  }, [preview, existingPrompts]);

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const items = Array.from(e.dataTransfer.items);
    if (items.length === 0) return;

    setIsProcessing(true);

    try {
      // Collect all files (including from folders)
      const files: File[] = [];

      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            await collectFiles(entry, files);
          }
        }
      }

      if (files.length === 0) {
        alert('No markdown files found in the dropped items.');
        setIsProcessing(false);
        return;
      }

      // Create a FileList-like object and process
      const fileList = createFileList(files);
      await processFiles(fileList);
    } catch (error) {
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsProcessing(false);
    }
  };

  const collectFiles = async (entry: any, files: File[]): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve) => {
        entry.file((f: File) => resolve(f));
      });
      if (file.name.endsWith('.md')) {
        files.push(file);
      }
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = await new Promise<any[]>((resolve) => {
        reader.readEntries((e: any[]) => resolve(e));
      });
      for (const childEntry of entries) {
        await collectFiles(childEntry, files);
      }
    }
  };

  const createFileList = (files: File[]): FileList => {
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    return dataTransfer.files;
  };

  const processFiles = async (files: FileList) => {
    const batchResult = await importMarkdownDirectory(files);

    if (batchResult.total === 0) {
      alert('No markdown files found.');
      setIsProcessing(false);
      return;
    }

    // Show preview with all successful parses
    setPreview(batchResult.results);

    // Auto-select all successfully parsed prompts
    const validIds = new Set(
      batchResult.results
        .filter(r => r.success && r.prompt)
        .map(r => r.prompt!.id)
    );
    setSelectedIds(validIds);
    setIsProcessing(false);
  };

  const handleFileSelect = async () => {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    await processFiles(files);
  };

  const handleFolderSelect = async () => {
    const files = folderInputRef.current?.files;
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    await processFiles(files);
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const handleImport = async () => {
    if (!preview) return;

    const selectedPrompts = preview.filter(
      p => p.success && p.prompt && selectedIds.has(p.prompt.id)
    );

    if (selectedPrompts.length === 0) {
      alert('No prompts selected for import.');
      return;
    }

    setIsProcessing(true);

    try {
      await onImport(selectedPrompts);
      resetState();
      onOpenChange(false);
    } catch (error) {
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  // Preview mode (either from file upload or initial prompts)
  if (preview) {
    const successCount = preview.filter(p => p.success).length;
    const errorCount = preview.filter(p => !p.success).length;
    const selectedCount = selectedIds.size;
    const newCount = preview.filter(p =>
      p.success && p.prompt && !existingPromptIds.includes(p.prompt.id) && selectedIds.has(p.prompt.id)
    ).length;
    const updateCount = preview.filter(p =>
      p.success && p.prompt && existingPromptIds.includes(p.prompt.id) && selectedIds.has(p.prompt.id)
    ).length;

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          {/* Header - Sticky */}
          <DialogHeader className="flex-none px-6 pt-6 pb-4 rounded-t-lg">
            <DialogTitle>
              Review Prompts ({successCount} parsed, {selectedCount} selected)
            </DialogTitle>
          </DialogHeader>

          {/* Stats - Sticky */}
          <div className="flex gap-2 flex-wrap flex-none pb-4 px-6 border-b">
            {newCount > 0 && (
              <Badge variant="default">{newCount} new</Badge>
            )}
            {updateCount > 0 && (
              <Badge variant="secondary">{updateCount} updates</Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive">{errorCount} errors</Badge>
            )}
          </div>

          {/* Prompt List - Scrollable Content */}
          <div className="flex-1 overflow-y-auto space-y-2 px-6 py-4">
            {preview.map((result, index) => {
              const isSelected = result.prompt && selectedIds.has(result.prompt.id);
              const willUpdate = result.prompt && existingPromptIds.includes(result.prompt.id);
              const isPossibleDuplicate = result.prompt && duplicateIds.has(result.prompt.id);

              return (
                <div
                  key={index}
                  className={`
                    rounded-lg border p-4 transition-all cursor-pointer
                    ${result.success
                      ? isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:border-primary/50'
                      : 'border-destructive/50 bg-destructive/5'
                    }
                  `}
                  onClick={() => result.success && result.prompt && toggleSelection(result.prompt.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!result.success}
                          onChange={() => {}}
                          className="h-4 w-4"
                        />
                        <h4 className="font-medium truncate">
                          {result.success && result.prompt ? result.prompt.title : result.fileName}
                        </h4>
                      </div>

                      {result.success && result.prompt ? (
                        <div className="mt-2 space-y-1">
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {result.prompt.description || 'No description'}
                          </p>
                          <div className="flex flex-wrap gap-1 items-center">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {result.prompt.id}
                            </code>
                            {result.prompt.tags.map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-1 items-center">
                            {willUpdate && (
                              <Badge variant="secondary" className="text-xs">
                                Will update existing
                              </Badge>
                            )}
                            {isPossibleDuplicate && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Possible duplicate
                              </Badge>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-destructive mt-1">{result.error}</p>
                      )}
                    </div>

                    <div className="flex-shrink-0">
                      {result.success ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions - Sticky Footer */}
          <div className="flex justify-between items-center border-t pt-4 pb-4 px-6 flex-none rounded-b-lg">
            <div className="text-sm text-muted-foreground">
              {selectedCount} of {successCount} prompts selected
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedCount === 0 || isProcessing}
              >
                {isProcessing ? 'Importing...' : `Import ${selectedCount} Prompt${selectedCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Get active (non-archived) prompts for export
  const activePromptsForExport = existingPrompts.filter(p => !p.isArchived);
  const exportSelectedCount = exportSelectedIds.size;

  // Main dialog with Import/Export tabs
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import / Export Prompts</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6">
        <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as 'import' | 'export' | 'attach')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="import" className="gap-2">
              <Download className="h-4 w-4" />
              Import
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2">
              <Upload className="h-4 w-4" />
              Export
            </TabsTrigger>
            <TabsTrigger value="attach" className="gap-2">
              <FolderSync className="h-4 w-4" />
              Attach
              {directoryMode && (
                <span className="ml-1 h-2 w-2 rounded-full bg-green-500" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* Import Tab */}
          <TabsContent value="import" className="space-y-4 mt-4">
            {/* Drag and Drop Zone */}
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={`
                relative border-2 border-dashed rounded-lg p-12 transition-colors
                ${isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/30 hover:border-primary/50'
                }
                ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
              `}
            >
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">
                    {isProcessing ? 'Processing files...' : 'Drag and drop multiple files or folders here'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Supports .md files with frontmatter • Drop multiple files at once
                  </p>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            {/* Manual Selection Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="h-24 flex flex-col gap-2"
              >
                <FileText className="h-6 w-6" />
                <div className="space-y-0.5">
                  <div className="font-medium">Select Files</div>
                  <div className="text-xs text-muted-foreground">Multiple selection</div>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={() => folderInputRef.current?.click()}
                disabled={isProcessing}
                className="h-24 flex flex-col gap-2"
              >
                <FolderUp className="h-6 w-6" />
                <div className="space-y-0.5">
                  <div className="font-medium">Select Folder</div>
                  <div className="text-xs text-muted-foreground">All .md files</div>
                </div>
              </Button>
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={folderInputRef}
              type="file"
              {...({ webkitdirectory: '', directory: '' } as any)}
              onChange={handleFolderSelect}
              className="hidden"
            />

            {/* Info */}
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm">Preview prompts before importing</p>
              </div>
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm">Files must have valid frontmatter with <code className="text-xs bg-muted px-1 py-0.5 rounded">id</code> and <code className="text-xs bg-muted px-1 py-0.5 rounded">title</code> fields</p>
              </div>
            </div>
          </TabsContent>

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-4 mt-4">
            {activePromptsForExport.length === 0 ? (
              <div className="text-center py-12">
                <Download className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">No prompts to export</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create some prompts first to export them.
                </p>
              </div>
            ) : (
              <>
                {/* Selection controls */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {exportSelectedCount} of {activePromptsForExport.length} prompts selected
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={selectAllForExport}
                      disabled={exportSelectedCount === activePromptsForExport.length}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={deselectAllForExport}
                      disabled={exportSelectedCount === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Prompt list */}
                <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-lg p-2">
                  {activePromptsForExport.map(prompt => {
                    const isSelected = exportSelectedIds.has(prompt.id);
                    return (
                      <div
                        key={prompt.id}
                        className={`
                          rounded-lg border p-3 cursor-pointer transition-all
                          ${isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                          }
                        `}
                        onClick={() => toggleExportSelection(prompt.id)}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="h-4 w-4 mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{prompt.title}</h4>
                            {prompt.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                                {prompt.description}
                              </p>
                            )}
                            {prompt.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {prompt.tags.slice(0, 3).map(tag => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {prompt.tags.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{prompt.tags.length - 3}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Export info */}
                <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">Exports as Obsidian-compatible markdown with frontmatter</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-sm">
                      {exportSelectedCount === 1
                        ? 'Single file download (.md)'
                        : `Multiple files as ZIP archive (${exportSelectedCount} files)`
                      }
                    </p>
                  </div>
                </div>

                {/* Export button */}
                <Button
                  onClick={handleExportSelected}
                  disabled={exportSelectedCount === 0 || isExporting}
                  className="w-full gap-2"
                >
                  {isExporting ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-background border-t-transparent rounded-full" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Export {exportSelectedCount} Prompt{exportSelectedCount !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </>
            )}
          </TabsContent>

          {/* Attach Tab */}
          <TabsContent value="attach" className="space-y-4 mt-4">
            {directoryMode && attachedDirectory ? (
              // Currently attached state
              <div className="space-y-4">
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="rounded-full bg-green-500/20 p-2">
                      <Link className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-700 dark:text-green-300">Directory Attached</h3>
                      <p className="text-sm text-muted-foreground">Live sync enabled</p>
                    </div>
                  </div>
                  <div className="bg-background/50 rounded-md p-3 font-mono text-sm break-all">
                    {attachedDirectory}
                  </div>
                </div>

                <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <FolderSync className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-sm">Changes to markdown files in this directory automatically update the app</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-sm">New prompts created in the app are saved as markdown files</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">Deleting a prompt will delete the markdown file</p>
                  </div>
                </div>

                {!showDetachConfirm ? (
                  <>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      onClick={handleSyncDirectory}
                      disabled={isSyncing}
                      className="w-full gap-2"
                    >
                      {isSyncing ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-background border-t-transparent rounded-full" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4" />
                          Sync Directory
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={handleDetachDirectory}
                      className="w-full gap-2 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                    >
                      <Unlink className="h-4 w-4" />
                      Detach Directory
                    </Button>

                    <p className="text-xs text-muted-foreground text-center">
                      Sync updates all app data to match your directory files
                    </p>
                  </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-red-600 dark:text-red-400">Confirm Detach</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          This will remove all prompts from the app. Your markdown files will remain in the directory, but the app will start fresh with an empty library.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDetachConfirm(false)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={confirmDetachDirectory}
                        className="flex-1"
                      >
                        Detach
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Not attached state
              <div className="space-y-4">
                <div className="rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-center">
                  <div className="rounded-full bg-primary/10 p-4 w-fit mx-auto mb-4">
                    <FolderSync className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Attach a Directory</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Link a folder (like your Obsidian vault) to sync prompts as markdown files in real-time
                  </p>
                  <Button
                    onClick={handleAttachDirectory}
                    disabled={isAttaching}
                    className="gap-2"
                  >
                    {isAttaching ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-background border-t-transparent rounded-full" />
                        Attaching...
                      </>
                    ) : (
                      <>
                        <FolderUp className="h-4 w-4" />
                        Select Directory
                      </>
                    )}
                  </Button>
                </div>

                <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">Works with Obsidian vaults and any folder</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">Real-time sync: edit files externally and see changes instantly</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">Files without valid frontmatter are ignored</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">Requires <code className="text-xs bg-muted px-1 py-0.5 rounded">id</code> and <code className="text-xs bg-muted px-1 py-0.5 rounded">title</code> in frontmatter</p>
                  </div>
                </div>
              </div>
            )}

            {/* Reset Data Section */}
            <div className="mt-6 pt-6 border-t border-border/50">
              <div className="space-y-3">
                {!showResetConfirm ? (
                  <Button
                    variant="outline"
                    onClick={handleResetData}
                    className="w-full gap-2 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset All App Data
                  </Button>
                ) : (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-red-600 dark:text-red-400">Confirm Reset</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          This will permanently delete all prompts, settings, and data from the app. 
                          Your markdown files will remain untouched, but the app will start completely fresh.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResetConfirm(false)}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={confirmResetData}
                        className="flex-1"
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  This action only affects app data - your markdown files will not be deleted
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
