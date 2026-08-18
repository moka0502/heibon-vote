const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'data', 'heibon-vote.db');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
// 1日1回運用を想定し、2週間分残す(2026-08-16、公開前の既知タスクへの対応)。
// ホスト側と同じディスク上のバックアップなのでホスト障害には無力だが、
// 誤操作・バグによるDB破壊にはすぐ戻せる。
const MAX_BACKUPS = 14;
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// dbハンドルを渡すと、コピー前にWALを主.dbへflushする(2026-08-18、CX担当ペルソナ指摘)。
// このアプリはjournal_mode=WALで動くため、単純なfs.copyFileSync(主.dbのみ)だと
// チェックポイント前の投票・セッションが`-wal`に溜まったまま欠落したバックアップになる。
// 稼働中のdb接続でwal_checkpoint(TRUNCATE)すれば、コミット済みデータが主.dbに移り完全になる
// (別プロセスでopenDbし直すとWAL競合でデータ喪失しうるため、必ず既存ハンドルを使う)。
function backupNow(db) {
  if (!fs.existsSync(DB_PATH)) return;
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (err) {
      console.error('backup: wal_checkpoint failed:', err);
    }
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `heibon-vote-${timestamp}.db`);
  fs.copyFileSync(DB_PATH, dest);
  pruneOldBackups();
  return dest;
}

function pruneOldBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('heibon-vote-') && f.endsWith('.db'))
    .sort();
  while (files.length > MAX_BACKUPS) {
    fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  }
}

// サーバープロセスが動いている間だけ効く(常時ホスティング前提の簡易版)。
function startAutoBackup(db) {
  setInterval(() => backupNow(db), AUTO_BACKUP_INTERVAL_MS).unref();
}

module.exports = { backupNow, startAutoBackup, BACKUP_DIR };
