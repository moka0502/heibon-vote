const express = require('express');
const { getLatestRealVoteRows } = require('../votes-dedup');

// 属性別の傾向は、実データ(is_dummy=0、同一voter_idは最新1票のみ)がこの件数に届くまで
// 「まだ十分でない」として隠す(2026-08-15指示: サンプルが少なすぎる分析は見せない)。
const BREAKDOWN_MIN_REAL_VOTES = 100;

function createTopicsRouter(db) {
  const router = express.Router();
  const optionStmt = db.prepare(
    'SELECT id, label FROM options WHERE topic_id = ? ORDER BY sort_order'
  );
  const topicStmt = db.prepare('SELECT id, question FROM topics WHERE id = ?');
  const attributeIdsStmt = db.prepare('SELECT id FROM attributes');

  router.get('/random', (req, res) => {
    const count = Math.min(Math.max(Number(req.query.count) || 10, 1), 100);
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const topicRows = category
      ? db
          .prepare(
            "SELECT id, question FROM topics WHERE status = 'active' AND category = ? ORDER BY RANDOM() LIMIT ?"
          )
          .all(category, count)
      : db
          .prepare("SELECT id, question FROM topics WHERE status = 'active' ORDER BY RANDOM() LIMIT ?")
          .all(count);
    const topics = topicRows.map((topic) => ({
      ...topic,
      options: optionStmt.all(topic.id),
    }));
    res.json({ topics });
  });

  router.get('/', (req, res) => {
    const topicRows = db
      .prepare("SELECT id, question FROM topics WHERE status = 'active' ORDER BY question")
      .all();
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

    const realVotes = getLatestRealVoteRows(db, topic.id);
    for (const vote of realVotes) {
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
    const realVoteCount = realVotes.length;

    res.json({
      topic: { ...topic, options: optionStmt.all(topic.id) },
      breakdown,
      realVoteCount,
      breakdownMinRealVotes: BREAKDOWN_MIN_REAL_VOTES,
    });
  });

  return router;
}

module.exports = { createTopicsRouter };
