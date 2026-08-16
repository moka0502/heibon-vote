const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const { createAttributesRouter } = require('./routes/attributes');
const { createCategoriesRouter } = require('./routes/categories');
const { createTopicsRouter } = require('./routes/topics');
const { createVotesRouter } = require('./routes/votes');
const { createSessionsRouter } = require('./routes/sessions');
const { createSuggestionsRouter } = require('./routes/suggestions');

const PORT = 4322;
const db = openDb();

const app = express();
app.use(express.json());
// クリックジャッキング対策(2026-08-16、「よくあるバグ100項目」チェックで発見)。
// X-Frame-Options未設定だと、悪意あるサイトがこのアプリをiframeで埋め込み、
// 透明にして重ねた上で投票ボタン等をクリックさせる攻撃が可能になる。
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  next();
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
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`heibon-vote server listening on http://localhost:${PORT}`);
});
