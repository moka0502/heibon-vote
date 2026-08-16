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

const PORT = 4322;
const db = openDb();
backupNow();
startAutoBackup();

const app = express();
app.use(express.json());
// クリックジャッキング対策(2026-08-16、「よくあるバグ100項目」チェックで発見)。
// X-Frame-Options未設定だと、悪意あるサイトがこのアプリをiframeで埋め込み、
// 透明にして重ねた上で投票ボタン等をクリックさせる攻撃が可能になる。
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ログイン機能がないアプリなので「認証」は成立しない。連打・bot対策として
// レート制限のみ実装する(2026-08-16、公開前の既知タスクへの対応)。
// 一般APIは緩め、投票・お題投稿等の書き込み系は厳しめにする。
const rateLimitHandler = (req, res) => {
  res.status(429).json({ error: 'アクセスが集中しています。しばらく待ってから再度お試しください。' });
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
  max: 30,
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
app.use('/api', generalApiLimiter);
app.use('/api/votes', writeLimiter);
app.use('/api/sessions', writeLimiter);
app.use('/api/suggestions', suggestionLimiter);

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
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`heibon-vote server listening on http://localhost:${PORT}`);
});
