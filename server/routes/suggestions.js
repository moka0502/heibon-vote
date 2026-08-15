const express = require('express');

const MAX_TEXT_LENGTH = 500;

function createSuggestionsRouter(db) {
  const router = express.Router();
  const insertSuggestion = db.prepare('INSERT INTO suggestions (text) VALUES (?)');

  router.post('/', (req, res) => {
    const { text } = req.body ?? {};
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      res.status(400).json({ error: `text is too long (max ${MAX_TEXT_LENGTH} chars)` });
      return;
    }
    insertSuggestion.run(trimmed);
    res.status(201).json({ ok: true });
  });

  return router;
}

module.exports = { createSuggestionsRouter };
