const express = require('express');

function createTopicsRouter(db) {
  const router = express.Router();
  const optionStmt = db.prepare(
    'SELECT id, label FROM options WHERE topic_id = ? ORDER BY sort_order'
  );
  const topicStmt = db.prepare('SELECT id, question FROM topics WHERE id = ?');
  const attributeIdsStmt = db.prepare('SELECT id FROM attributes');
  const topicVotesStmt = db.prepare(
    'SELECT option_id AS optionId, profile_json AS profileJson FROM votes WHERE topic_id = ?'
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

  router.get('/', (req, res) => {
    const topicRows = db.prepare('SELECT id, question FROM topics ORDER BY question').all();
    const topics = topicRows.map((topic) => ({
      ...topic,
      options: optionStmt.all(topic.id),
    }));
    res.json({ topics });
  });

  router.get('/:id/breakdown', (req, res) => {
    const topic = topicStmt.get(req.params.id);
    if (!topic) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    const attributeIds = attributeIdsStmt.all().map((row) => row.id);
    const breakdown = Object.fromEntries(attributeIds.map((id) => [id, {}]));

    for (const vote of topicVotesStmt.all(topic.id)) {
      let profile;
      try {
        profile = JSON.parse(vote.profileJson);
      } catch {
        continue;
      }
      for (const attributeId of attributeIds) {
        const valueId = profile[attributeId];
        if (!valueId) continue;
        const perValue = (breakdown[attributeId][valueId] ??= {});
        perValue[vote.optionId] = (perValue[vote.optionId] ?? 0) + 1;
      }
    }

    res.json({ topic: { ...topic, options: optionStmt.all(topic.id) }, breakdown });
  });

  return router;
}

module.exports = { createTopicsRouter };
