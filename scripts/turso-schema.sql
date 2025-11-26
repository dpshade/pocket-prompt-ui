-- Pocket Prompt Turso Database Schema
-- Run this SQL against your Turso database to set up tables

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
CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_updated_at ON prompts(updated_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_versions_prompt ON prompt_versions(prompt_id);

-- Tags (normalized)
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

CREATE TABLE IF NOT EXISTS prompt_tags (
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (prompt_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_prompt_tags_tag ON prompt_tags(tag_id);

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
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);
