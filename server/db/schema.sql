CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS options (
  topic_id TEXT NOT NULL REFERENCES topics(id),
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (topic_id, id)
);

CREATE TABLE IF NOT EXISTS attributes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attribute_values (
  attribute_id TEXT NOT NULL REFERENCES attributes(id),
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (attribute_id, id)
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id TEXT PRIMARY KEY,
  match_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  session_tier TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  is_dummy INTEGER NOT NULL DEFAULT 0,
  -- 回答時点(このvote自身を含める前)の多数派選択肢のスナップショット。
  -- セッション確定時に、クライアントの自己申告を信用せずサーバー側だけで正誤を再計算するために保持する。
  majority_option_id_at_vote TEXT,
  session_id TEXT REFERENCES quiz_sessions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (topic_id, option_id) REFERENCES options(topic_id, id)
);

CREATE INDEX IF NOT EXISTS idx_votes_topic_option ON votes(topic_id, option_id);
CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
