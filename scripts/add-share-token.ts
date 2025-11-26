/**
 * Add share_token column to prompts table
 */
import { createClient } from '@libsql/client';

const url = process.env.VITE_TURSO_DATABASE_URL;
const authToken = process.env.VITE_TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('Missing VITE_TURSO_DATABASE_URL or VITE_TURSO_AUTH_TOKEN');
  process.exit(1);
}

const client = createClient({ url, authToken });

async function addShareToken() {
  // Add share_token column if not exists
  try {
    await client.execute('ALTER TABLE prompts ADD COLUMN share_token TEXT');
    console.log('✓ Added share_token column');
  } catch (e: any) {
    if (e.message?.includes('duplicate column')) {
      console.log('○ share_token column already exists');
    } else {
      console.error('✗ Error adding column:', e.message);
    }
  }

  // Create unique index for share_token (only for non-null values)
  try {
    await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_share_token ON prompts(share_token) WHERE share_token IS NOT NULL');
    console.log('✓ Created unique index for share_token');
  } catch (e: any) {
    console.log('○ Index status:', e.message);
  }
}

addShareToken().catch(console.error);
