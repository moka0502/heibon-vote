const express = require('express');

function createTopicsRouter(db) {
  const router = express.Router();
  const optionStmt = db.prepare(
    'SELECT id, label FROM options WHERE topic_id = ? ORDER BY sort_order'
  );

  router.get('/random', (req, res) => {
    const count = Math.min(Math.max(Number(req.query.count) || 10, 1), 100);
    const topicRows = db
      .prepare('SELECT id, question FROM topics ORDER BY RANDOM() LIMIT ?')
      .all(count);
    const topics = topicRows.map((topic) => ({
      ...topic,
      options: optionStmt.all(topic.id),
    }));
    res.json({ topics });
  });

  return router;
}

module.exports = { createTopicsRouter };
