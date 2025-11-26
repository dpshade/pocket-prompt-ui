/**
 * Setup script to initialize Turso database schema
 * Run with: bun scripts/setup-turso.ts
 */
import { createClient } from '@libsql/client';

const url = process.env.VITE_TURSO_DATABASE_URL;
const authToken = process.env.VITE_TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('Missing VITE_TURSO_DATABASE_URL or VITE_TURSO_AUTH_TOKEN');
  process.exit(1);
}

const client = createClient({ url, authToken });

const schema = `
-- Users (anonymous device-based identity)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Prompts
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  content TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1
);

-- Version history
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  change_note TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(prompt_id, version)
);

-- Tags (normalized)
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS prompt_tags (
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (prompt_id, tag_id)
);

-- Saved searches
CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  expression TEXT NOT NULL,
  text_query TEXT,
  updated_at INTEGER NOT NULL
);
`;

async function setup() {
  console.log('Setting up Turso database...');

  // Split by semicolons and run each statement
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const sql of statements) {
    try {
      await client.execute(sql);
      console.log('✓', sql.split('\n')[0].substring(0, 50) + '...');
    } catch (error) {
      console.error('✗ Error:', error);
    }
  }

  // Create indexes separately
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_prompts_updated_at ON prompts(updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_versions_prompt ON prompt_versions(prompt_id)',
    'CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)',
    'CREATE INDEX IF NOT EXISTS idx_prompt_tags_tag ON prompt_tags(tag_id)',
    'CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id)',
  ];

  for (const sql of indexes) {
    try {
      await client.execute(sql);
      console.log('✓', sql.substring(0, 60) + '...');
    } catch (error) {
      // Index might already exist
      console.log('○', sql.substring(0, 60) + '... (exists)');
    }
  }

  console.log('\n✅ Database setup complete!');

  // Verify tables
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('\nTables created:', tables.rows.map(r => r.name).join(', '));
}

setup().catch(console.error);
