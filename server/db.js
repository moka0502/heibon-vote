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
  seed(db);
  return db;
}

module.exports = { openDb };
