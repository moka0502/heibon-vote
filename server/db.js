const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { seed } = require('./seed');

const DB_PATH = path.join(__dirname, 'data', 'heibon-vote.db');
const SCHEMA_PATH = path.join(__dirname, 'db', 'schema.sql');

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  migrate(db);
  seed(db);
  return db;
}

// CREATE TABLE IF NOT EXISTSは既存テーブルへの列追加をしないため、
// 開発中に増えた列はここで個別に追いかける(本番データが増えたら正式なマイグレーション手順に切り替える)。
function migrate(db) {
  const voteColumns = db.prepare('PRAGMA table_info(votes)').all();
  const hasVoterId = voteColumns.some((col) => col.name === 'voter_id');
  if (!hasVoterId) {
    db.exec('ALTER TABLE votes ADD COLUMN voter_id TEXT');
  }

  const topicColumns = db.prepare('PRAGMA table_info(topics)').all();
  const hasCategory = topicColumns.some((col) => col.name === 'category');
  if (!hasCategory) {
    // seed()が直後に全topicのcategoryをUPSERTで埋めるため、ここではNULL許容で追加するだけでよい
    db.exec('ALTER TABLE topics ADD COLUMN category TEXT');
  }

  const sessionColumns = db.prepare('PRAGMA table_info(quiz_sessions)').all();
  const hasSessionVoterId = sessionColumns.some((col) => col.name === 'voter_id');
  if (!hasSessionVoterId) {
    db.exec('ALTER TABLE quiz_sessions ADD COLUMN voter_id TEXT');
  }

  const categoryColumns = db.prepare('PRAGMA table_info(categories)').all();
  const hasLaunched = categoryColumns.some((col) => col.name === 'launched');
  if (!hasLaunched) {
    // seed()が直後にcategories-seed.jsonのlaunched値でUPSERTするため、
    // ここではDEFAULT 1(全カテゴリ公開扱い)で追加するだけでよい
    db.exec('ALTER TABLE categories ADD COLUMN launched INTEGER NOT NULL DEFAULT 1');
  }
}

module.exports = { openDb };
