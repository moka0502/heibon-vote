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
app.use('/api', generalApiLimiter);
app.use('/api/votes', writeMethodsOnly(writeLimiter));
app.use('/api/sessions', writeMethodsOnly(writeLimiter));
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
