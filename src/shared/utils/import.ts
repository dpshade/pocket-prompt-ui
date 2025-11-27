import matter from 'gray-matter';

export interface ImportedPrompt {
  id: string;
  title: string;
  description: string;
  content: string;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
  isArchived?: boolean;
}

export interface ImportResult {
  success: boolean;
  prompt?: ImportedPrompt;
  error?: string;
}

export interface FileImportResult {
  fileName: string;
  success: boolean;
  prompt?: ImportedPrompt;
  error?: string;
}

export interface BatchImportResult {
  total: number;
  successful: number;
  failed: number;
  results: FileImportResult[];
}

/**
 * Parse a markdown file with frontmatter and extract prompt data
 */
export function parseMarkdownPrompt(fileContent: string): ImportResult {
  try {
    // Parse the markdown with frontmatter
    const { data, content } = matter(fileContent);

    // Validate required fields
    if (!data.id) {
      return {
        success: false,
        error: 'Missing required field: id',
      };
    }

    if (!data.title && !content.trim()) {
      return {
        success: false,
        error: 'Missing required field: title (or content for fallback)',
      };
    }

    // Extract and convert fields
    const id = String(data.id);
    const title = data.title || 'Untitled';
    const description = data.description || '';
    const tags = Array.isArray(data.tags) ? data.tags : [];

    // Convert timestamps if present
    let createdAt: number | undefined;
    let updatedAt: number | undefined;

    if (data.created_at) {
      const createdDate = new Date(data.created_at);
      if (!isNaN(createdDate.getTime())) {
        createdAt = createdDate.getTime();
      }
    }

    if (data.updated_at) {
      const updatedDate = new Date(data.updated_at);
      if (!isNaN(updatedDate.getTime())) {
        updatedAt = updatedDate.getTime();
      }
    }

    // Check archived status
    const isArchived = data.archived === true;

    return {
      success: true,
      prompt: {
        id,
        title,
        description,
        content: content.trim(),
        tags,
        createdAt,
        updatedAt,
        isArchived,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse markdown file',
    };
  }
}

/**
 * Read and parse a markdown file from a File object
 */
export async function importMarkdownFile(file: File): Promise<ImportResult> {
  try {
    // Validate file type
    if (!file.name.endsWith('.md')) {
      return {
        success: false,
        error: 'Invalid file type. Only .md files are supported.',
      };
    }

    // Read file content
    const fileContent = await file.text();

    // Parse the markdown
    return parseMarkdownPrompt(fileContent);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read file',
    };
  }
}

/**
 * Import multiple markdown files from a directory
 */
export async function importMarkdownDirectory(files: FileList): Promise<BatchImportResult> {
  const results: FileImportResult[] = [];
  let successful = 0;
  let failed = 0;

  // Filter for .md files only
  const mdFiles = Array.from(files).filter(file => file.name.endsWith('.md'));

  // Process each file
  for (const file of mdFiles) {
    const result = await importMarkdownFile(file);

    const fileResult: FileImportResult = {
      fileName: file.name,
      success: result.success,
      prompt: result.prompt,
      error: result.error,
    };

    results.push(fileResult);

    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  return {
    total: mdFiles.length,
    successful,
    failed,
    results,
  };
}
