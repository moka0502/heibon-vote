const path = require('node:path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { openDb } = require('./db');
const { backupNow, startAutoBackup } = require('./backup');
const { createAttributesRouter } = require('./routes/attributes');
const { createCategoriesRouter } = require('./routes/categories');
const { createTopicsRouter } = require('./routes/topics');
const { createVotesRouter } = require('./routes/votes');
const { createSessionsRouter } = require('./routes/sessions');
const { createSuggestionsRouter } = require('./routes/suggestions');

// テストを開発サーバー(4322)と衝突させずに別ポートで起動できるようにする。
const PORT = Number(process.env.PORT) || 4322;
const db = openDb();
// dbハンドルを渡してWALをflushしてからバックアップする(単純コピーだとWAL内の最新票が欠落)。
backupNow(db);
startAutoBackup(db);

const app = express();
// 技術スタックを開示するX-Powered-Byヘッダーを消す(2026-08-17、開発運用者ペルソナの
// 指摘。攻撃対象の絞り込みに使われる軽微な情報開示)。
app.disable('x-powered-by');
// ペイロードサイズ上限(2026-08-16、App Store提出前チェックリストで発見)。
// 上限なしだとexpress.jsonが巨大なJSONも素通しし、413ではなくメモリ圧迫や
// 500につながりうる。このアプリのAPIは短文フィールドのみ扱うため1mbで十分。
app.use(express.json({ limit: '1mb' }));
// クリックジャッキング対策(2026-08-16、「よくあるバグ100項目」チェックで発見)。
// X-Frame-Options未設定だと、悪意あるサイトがこのアプリをiframeで埋め込み、
// 透明にして重ねた上で投票ボタン等をクリックさせる攻撃が可能になる。
// CSPも同時に設定(2026-08-16、iOS化に向けたセキュリティ監査で追加)。
// www/index.htmlは外部scriptタグのみでインラインscript/styleが無いため、
// script-src 'self'で機能を壊さず適用できる。GSAPはCDNでなくローカル同梱済み。
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
  );
  next();
});

// ログイン機能がないアプリなので「認証」は成立しない。連打・bot対策として
// レート制限のみ実装する(2026-08-16、公開前の既知タスクへの対応)。
// 一般APIは緩め、投票・お題投稿等の書き込み系は厳しめにする。
// userFacing は「このメッセージはそのまま画面に出してよい」という印。
// サーバーのエラー文言は大半が 'invalid JSON' のような英語の技術文言で、
// 利用者に見せるべきでない。クライアントは既定でそれらを伏せて共通文言を出すが、
// この429のように利用者向けに書いた日本語まで巻き添えで捨てられていたため、
// 見せてよいものだけを明示する(2026-08-22、カスタマーサポート観点のレビューで発覚)。
const rateLimitHandler = (req, res) => {
  res.status(429).json({
    error: 'アクセスが集中している。少し待ってから、もう一度試してみよう。',
    userFacing: true,
  });
};
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  // 1周のクイズで書き込みは投票10回+セッション保存1回=11回。30だと約2.7周で頭打ちになり、
  // 連続プレイの熱心なユーザーが詰まる(2026-08-17、CXレビュー)。60にして4〜5周の余裕を
  // 持たせつつ、1IPあたり60書き込み/分は通常プレイでは出ない水準なのでbot対策は維持できる。
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
const suggestionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
// writeLimiterはPOST/PUT/DELETE等の書き込みのみに適用する。GETまで巻き込むと
// 例えば1回のクイズプレイ(投票10回+結果保存1回)だけで、結果画面表示やホーム帰還時の
// 統計取得(GET)がバケットを消費し尽くし、2周目の途中で正常な読み取りまで429になる
// (2026-08-17、CX担当ペルソナレビューで発覚: 進行中クイズの状態が丸ごと失われる)。
const writeMethodsOnly = (limiter) => (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return limiter(req, res, next);
};
// 【本番デプロイ時の必須設定】リバースプロキシ(Oracle Cloud等のLB/nginx、Tailscale serve)
// の背後で動かす場合、`app.set('trust proxy', <信頼するホップ数>)` を入れないと req.ip が
// プロキシIPになり、全ユーザーが1つのレート制限バケットを共有してしまう(審査官のアクセスまで
// 429で巻き込まれ得る。2026-08-17、開発運用者ペルソナ指摘)。ここで無条件に有効化しないのは、
// プロキシが無い直アクセス構成だとクライアントがX-Forwarded-Forを偽装してレート制限を回避
// できてしまうため。デプロイ構成が確定した時点で、そのホップ数に合わせて設定すること。
// 2026-08-20: 本番構成が「nginx(1ホップ)→ Node」で確定したため有効化。これで req.ip が
// X-Forwarded-Forの実クライアントIPになり、レート制限がユーザーごとに正しく効く。
app.set('trust proxy', 1);
app.use('/api', generalApiLimiter);
app.use('/api/votes', writeMethodsOnly(writeLimiter));
app.use('/api/sessions', writeMethodsOnly(writeLimiter));
app.use('/api/suggestions', suggestionLimiter);

// バージョンの一次情報源は package.json ひとつにする(画面と二重管理しない)。
// 不具合報告を受けたとき「どのバージョンか」が分からないと調査できないため、
// アバウト画面がこれを読んで表示する(RELEASE-KIT 2章)。
const appVersion = require('../package.json').version;
app.get('/api/version', (req, res) => {
  res.json({ version: appVersion });
});

app.use('/api/attributes', createAttributesRouter(db));
app.use('/api/categories', createCategoriesRouter(db));
app.use('/api/topics', createTopicsRouter(db));
app.use('/api/votes', createVotesRouter(db));
app.use('/api/sessions', createSessionsRouter(db));
app.use('/api/suggestions', createSuggestionsRouter(db));
app.use(express.static(path.join(__dirname, '..', 'www')));

// グローバル例外ハンドラ(2026-08-16、大規模テストのセキュリティ観点で発見)。
// これがないと、ルートハンドラ内の同期例外(不正なリクエスト由来のものを含む)が
// Expressの既定エラーハンドラに落ち、サーバーの絶対パスを含むスタックトレースが
// そのままHTMLでクライアントに返ってしまう。ここで捕捉し、詳細はサーバー側の
// ログにのみ残し、クライアントには汎用的なエラーだけを返す。
app.use((err, req, res, next) => {
  // クライアント起因のリクエストエラー(壊れたJSON・上限超過ペイロード)は本来400/413で
  // 返すべきものが、express.jsonの投げる例外としてここに落ちて500化していた(2026-08-17、
  // 開発運用者ペルソナの意地悪テストで発見)。type別に正しいステータスへ振り分ける。
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid JSON' });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'payload too large' });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`heibon-vote server listening on http://localhost:${PORT}`);
});
