-- NovelForge v3.5 记忆库 Schema

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('character', 'world', 'plot', 'style', 'lesson')),
  source_chapter INTEGER NOT NULL,
  last_accessed_chapter INTEGER,
  access_count INTEGER DEFAULT 0,
  importance REAL DEFAULT 0.5,
  decay_rate REAL DEFAULT 0.01,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'conflict')),
  conflicts_with TEXT,
  embedding BLOB,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_chapter ON memories(source_chapter);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);

-- 全文记忆缓存表
CREATE TABLE IF NOT EXISTS full_text_cache (
  chapter_number INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  full_text TEXT NOT NULL,
  summary TEXT NOT NULL,
  compressed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- /dream 整合记录表
CREATE TABLE IF NOT EXISTS dream_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_chapter INTEGER NOT NULL,
  chapters_integrated TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
