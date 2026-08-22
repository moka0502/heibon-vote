const express = require('express');

const MAX_TEXT_LENGTH = 500;
// 受け付ける種別。未知の値は既定の 'idea' に倒す(利用者が選べるのはこの2つだけ)。
const KINDS = ['idea', 'bug'];

function createSuggestionsRouter(db) {
  const router = express.Router();
  const insertSuggestion = db.prepare('INSERT INTO suggestions (text, kind) VALUES (?, ?)');

  router.post('/', (req, res) => {
    const { text, kind } = req.body ?? {};
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      res.status(400).json({ error: `text is too long (max ${MAX_TEXT_LENGTH} chars)` });
      return;
    }
    const safeKind = KINDS.includes(kind) ? kind : 'idea';
    insertSuggestion.run(trimmed, safeKind);
    res.status(201).json({ ok: true });
  });

  return router;
}

module.exports = { createSuggestionsRouter };
