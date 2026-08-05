const express = require('express');
const crypto = require('node:crypto');
const { sessionTierFor, lifetimeTitleFor } = require('../tiers');

function createSessionsRouter(db) {
  const router = express.Router();

  const insertSession = db.prepare(
    'INSERT INTO quiz_sessions (id, match_count, total_count, session_tier) VALUES (?, ?, ?, ?)'
  );
  const listSessionsStmt = db.prepare(
    `SELECT id, match_count AS matchCount, total_count AS totalCount,
            session_tier AS sessionTier, created_at AS createdAt
     FROM quiz_sessions ORDER BY created_at DESC`
  );
  const getSessionStmt = db.prepare(
    `SELECT id, match_count AS matchCount, total_count AS totalCount,
            session_tier AS sessionTier, created_at AS createdAt
     FROM quiz_sessions WHERE id = ?`
  );
  const getSessionVotesStmt = db.prepare(
    `SELECT v.topic_id AS topicId, t.question, v.option_id AS optionId, o.label AS optionLabel,
            v.majority_option_id_at_vote AS majorityOptionId, mo.label AS majorityOptionLabel
     FROM votes v
     JOIN topics t ON t.id = v.topic_id
     JOIN options o ON o.topic_id = v.topic_id AND o.id = v.option_id
     LEFT JOIN options mo ON mo.topic_id = v.topic_id AND mo.id = v.majority_option_id_at_vote
     WHERE v.session_id = ?
     ORDER BY v.id`
  );
  const perfectSessionCountStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM quiz_sessions WHERE match_count = total_count'
  );

  // /stats は /:id より先に登録する(そうしないと :id が "stats" にマッチしてしまう)
  router.get('/stats', (req, res) => {
    const { count } = perfectSessionCountStmt.get();
    res.json({ perfectCount: count, lifetimeTitle: lifetimeTitleFor(count) });
  });

  router.get('/', (req, res) => {
    res.json({ sessions: listSessionsStmt.all() });
  });

  router.get('/:id', (req, res) => {
    const session = getSessionStmt.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ session, votes: getSessionVotesStmt.all(req.params.id) });
  });

  router.post('/', (req, res) => {
    const { voteIds } = req.body ?? {};
    if (!Array.isArray(voteIds) || voteIds.length === 0) {
      res.status(400).json({ error: 'voteIds is required' });
      return;
    }

    const placeholders = voteIds.map(() => '?').join(',');
    const votes = db
      .prepare(
        `SELECT id, option_id AS optionId, majority_option_id_at_vote AS majorityOptionId
         FROM votes WHERE id IN (${placeholders})`
      )
      .all(...voteIds);

    if (votes.length !== voteIds.length) {
      res.status(400).json({ error: 'one or more voteIds not found' });
      return;
    }

    const totalCount = votes.length;
    const matchCount = votes.filter((v) => v.optionId === v.majorityOptionId).length;
    const tier = sessionTierFor(matchCount, totalCount);
    const sessionId = crypto.randomUUID();

    const run = db.transaction(() => {
      insertSession.run(sessionId, matchCount, totalCount, tier);
      db.prepare(`UPDATE votes SET session_id = ? WHERE id IN (${placeholders})`).run(
        sessionId,
        ...voteIds
      );
    });
    run();

    res.json({ sessionId, matchCount, totalCount, tier });
  });

  return router;
}

module.exports = { createSessionsRouter };
