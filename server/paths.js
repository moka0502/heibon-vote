// データファイルの置き場所を定義する唯一の場所。
// 以前は db.js と backup.js が同じパスをそれぞれ定義しており、片方だけ変えると
// バックアップ元と実DBがズレる状態だった(共通標準「一つの事実源」に反する)。
//
// HEIBON_DATA_DIR を渡すと差し替えられる。テストを本番/開発のDBから隔離して
// 走らせるために使う(共通標準「テストは本番データを変更しない」)。
const path = require('node:path');

const DATA_DIR = process.env.HEIBON_DATA_DIR || path.join(__dirname, 'data');

module.exports = {
  DATA_DIR,
  DB_PATH: path.join(DATA_DIR, 'heibon-vote.db'),
  BACKUP_DIR: path.join(DATA_DIR, 'backups'),
};
