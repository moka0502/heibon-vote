CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES categories(id),
  -- 'active'はランダム出題・お題一覧に出る。'stock'は優先度を下げて温存中のお題
  -- (データはあるが今は出題しない。将来activeに昇格させることを想定)。
  status TEXT NOT NULL DEFAULT 'active',
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
  -- 端末ごとに持つ匿名ID(localStorage生成)。同一人物が同じお題に何度も回答した場合、
  -- 多数派集計ではこのIDの最新1票だけを数える。ダミー票・旧データはNULLのままでよい
  -- (NULLは「誰の票か分からない」= 集計時は全部そのまま数える扱い)。
  voter_id TEXT,
  -- 回答時点(このvote自身を含める前)の多数派選択肢のスナップショット。
  -- セッション確定時に、クライアントの自己申告を信用せずサーバー側だけで正誤を再計算するために保持する。
  majority_option_id_at_vote TEXT,
  session_id TEXT REFERENCES quiz_sessions(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (topic_id, option_id) REFERENCES options(topic_id, id)
);

CREATE INDEX IF NOT EXISTS idx_votes_topic_option ON votes(topic_id, option_id);
CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
CREATE INDEX IF NOT EXISTS idx_votes_topic_voter ON votes(topic_id, voter_id);

-- 「こんなお題を入れて」というユーザーからの投稿。審査・採用フローは今のところ手動
-- (件数が増えたら管理画面を検討する)。
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
