const express = require('express');
const { getMajorityOptionId, getVoteCounts, percentagesFor } = require('../majority');

function createVotesRouter(db) {
  const router = express.Router();
  const optionExists = db.prepare('SELECT 1 FROM options WHERE topic_id = ? AND id = ?');
  const insertVote = db.prepare(
    `INSERT INTO votes (topic_id, option_id, profile_json, is_dummy, voter_id, majority_option_id_at_vote)
     VALUES (?, ?, ?, 0, ?, ?)`
  );

  router.post('/', (req, res) => {
    const { topicId, optionId, profile, voterId } = req.body ?? {};
    if (!topicId || !optionId) {
      res.status(400).json({ error: 'topicId and optionId are required' });
      return;
    }
    // topicId/optionIdにオブジェクト等を渡すと、後段のSQLプレースホルダバインドで
    // 例外が投げられグローバルエラーハンドラ頼みの汎用500になってしまっていた
    // (2026-08-16、sessions.jsのvoteIds型検証と同じ横展開チェックで発見)。
    // topics/optionsのidはDB上TEXTのため、文字列であることをここで検証し400で弾く。
    if (typeof topicId !== 'string' || typeof optionId !== 'string') {
      res.status(400).json({ error: 'topicId and optionId must be strings' });
      return;
    }
    if (!optionExists.get(topicId, optionId)) {
      res.status(404).json({ error: 'unknown topicId/optionId' });
      return;
    }

    // 自分の一票を数える前の多数派を基準に、正誤をこの時点でスナップショットする
    const majorityOptionId = getMajorityOptionId(db, topicId);
    const result = insertVote.run(
      topicId,
      optionId,
      JSON.stringify(profile ?? {}),
      voterId ?? null,
      majorityOptionId
    );

    // 自分の一票を含めた最新の内訳を、そのまま画面のフィードバックに使う
    const counts = getVoteCounts(db, topicId);
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    const percentages = percentagesFor(counts);

    res.json({
      voteId: result.lastInsertRowid,
      isMajorityMatch: optionId === majorityOptionId,
      majorityOptionId,
      percentages,
      totalVotes: total,
    });
  });

  return router;
}

module.exports = { createVotesRouter };
