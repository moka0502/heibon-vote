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
    // `Number(req.query.count) || 10` だと count=0 が(0が偽値のため)デフォルト10に
    // フォールバックしてしまい、Math.max(...,1)の下限クランプに一度も到達しなかった
    // (2026-08-16、大規模テストの閾値テストで発見)。未指定/NaNのみデフォルトへ、
    // 0を含む有効な数値は[1,100]にクランプする。
    const rawCount = Number(req.query.count);
    const count =
      req.query.count === undefined || Number.isNaN(rawCount)
        ? 10
        : Math.min(Math.max(rawCount, 1), 100);
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    // part=1: そのカテゴリの中で常に同じ固定10問(挿入順=rowid順)。
    // part=2: part=1で使った10問を除いた残り全部からランダムに10問。
    // カテゴリのお題数が半端(11問等)でも、ボタンには常に「10問ぴったりの束」として見せるための仕組み
    // (2026-08-16、カテゴリボタンの「(11問)」のような表示が気持ち悪いという指摘を受けて追加)。
    const part = category ? Number(req.query.part) : null;
    let topicRows;
    if (part === 1) {
      topicRows = db
        .prepare(
          "SELECT id, question FROM topics WHERE status = 'active' AND category = ? ORDER BY rowid LIMIT 10"
        )
        .all(category);
    } else if (part === 2) {
      topicRows = db
        .prepare(
          `SELECT id, question FROM (
             SELECT id, question, rowid FROM topics
             WHERE status = 'active' AND category = ?
             ORDER BY rowid LIMIT -1 OFFSET 10
           ) ORDER BY RANDOM() LIMIT 10`
        )
        .all(category);
    } else if (category) {
      topicRows = db
        .prepare(
          "SELECT id, question FROM topics WHERE status = 'active' AND category = ? ORDER BY RANDOM() LIMIT ?"
        )
        .all(category, count);
    } else {
      // カテゴリ非指定のランダムは、初回リリースでカテゴリを絞っている間(categories.launched)は
      // その範囲だけを母集団にする(2026-08-16、5カテゴリでの初回リリース対応)。
      topicRows = db
        .prepare(
          `SELECT t.id, t.question FROM topics t
           JOIN categories c ON c.id = t.category
           WHERE t.status = 'active' AND c.launched = 1
           ORDER BY RANDOM() LIMIT ?`
        )
        .all(count);
    }
    const topics = topicRows.map((topic) => ({
      ...topic,
      options: optionStmt.all(topic.id),
    }));
    res.json({ topics });
  });

  router.get('/', (req, res) => {
    const topicRows = db
      .prepare(
        `SELECT t.id, t.question, t.category, c.label AS categoryLabel
         FROM topics t
         JOIN categories c ON c.id = t.category
         WHERE t.status = 'active' AND c.launched = 1
         ORDER BY c.sort_order, t.question`
      )
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
