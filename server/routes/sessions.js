const express = require('express');
const crypto = require('node:crypto');
const { sessionTierFor, lifetimeTitleFor } = require('../tiers');
const { getVoteCounts } = require('../majority');

function createSessionsRouter(db) {
  const router = express.Router();

  const optionStmt = db.prepare(
    'SELECT id, label FROM options WHERE topic_id = ? ORDER BY sort_order'
  );
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
  const totalSessionsStmt = db.prepare('SELECT COUNT(*) AS count FROM quiz_sessions');
  const sessionsWithLowerOrEqualScoreStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM quiz_sessions WHERE match_count <= ?'
  );
  // サンプルが少なすぎる順位表示は誤解を招くため、一定数貯まるまでは出さない
  // (属性別内訳のBREAKDOWN_MIN_REAL_VOTESと同じ考え方)。
  const MIN_SESSIONS_FOR_PERCENTILE = 20;
  // クライアント(www/js/app.js)のQUESTIONS_PER_SESSIONと同じ値。クライアント/サーバー間で
  // 共有できる設定ファイルが今のところないため定数を重複させている(2026-08-16、大規模テストで
  // 「voteIdsの件数を検証していない」不具合が見つかり追加)。
  const QUESTIONS_PER_SESSION = 10;

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
    const votes = getSessionVotesStmt.all(req.params.id).map((vote) => {
      const counts = getVoteCounts(db, vote.topicId);
      const total = counts.reduce((sum, c) => sum + c.count, 0);
      const percentages = Object.fromEntries(
        counts.map((c) => [c.optionId, total > 0 ? Math.round((c.count / total) * 100) : 0])
      );
      return { ...vote, options: optionStmt.all(vote.topicId), percentages };
    });
    res.json({ session, votes });
  });

  router.post('/', (req, res) => {
    const { voteIds } = req.body ?? {};
    if (!Array.isArray(voteIds) || voteIds.length === 0) {
      res.status(400).json({ error: 'voteIds is required' });
      return;
    }
    if (voteIds.length !== QUESTIONS_PER_SESSION) {
      res.status(400).json({ error: `voteIds must contain exactly ${QUESTIONS_PER_SESSION} entries` });
      return;
    }
    // voteIdsに数値以外(オブジェクト等)が混じっていると、後段のSQLプレースホルダ
    // バインドで`RangeError: Too few parameter values were provided`が投げられ500に
    // なっていた(2026-08-16、大規模テストで発見)。ここで型を検証し400で弾く。
    if (!voteIds.every((id) => Number.isInteger(id))) {
      res.status(400).json({ error: 'voteIds must be an array of integers' });
      return;
    }

    const placeholders = voteIds.map(() => '?').join(',');
    const votes = db
      .prepare(
        `SELECT id, option_id AS optionId, majority_option_id_at_vote AS majorityOptionId,
                session_id AS sessionId
         FROM votes WHERE id IN (${placeholders})`
      )
      .all(...voteIds);

    // 「存在しない」と「既に別のセッションに使われている」を別々のメッセージで返すと、
    // 外部から特定のvoteIdの実在・使用状況を列挙できてしまう(2026-08-16、大規模テストの
    // 意地悪テストで発見)。クライアントもエラー内容で分岐しないため、あえて同じ文言にする。
    if (votes.length !== voteIds.length) {
      res.status(400).json({ error: 'one or more voteIds are invalid' });
      return;
    }
    // 既に別のセッションに使われたvoteIdを再送すると、session_idの無条件UPDATEで
    // 元のセッションからvoteが奪われ、元のセッションの内訳が空になってしまう
    // (2026-08-16、大規模テストの意地悪テストで発見)。
    if (votes.some((v) => v.sessionId !== null)) {
      res.status(400).json({ error: 'one or more voteIds are invalid' });
      return;
    }

    const totalCount = votes.length;
    const matchCount = votes.filter((v) => v.optionId === v.majorityOptionId).length;
    const tier = sessionTierFor(matchCount, totalCount);
    const sessionId = crypto.randomUUID();

    // 自分自身を含める前の、これまでの挑戦者の中での順位(Spotify Wrapped深掘り分SW1)。
    const { count: totalSessions } = totalSessionsStmt.get();
    let percentile = null;
    if (totalSessions >= MIN_SESSIONS_FOR_PERCENTILE) {
      const { count: lowerOrEqual } = sessionsWithLowerOrEqualScoreStmt.get(matchCount);
      percentile = Math.round((lowerOrEqual / totalSessions) * 100);
    }

    const run = db.transaction(() => {
      insertSession.run(sessionId, matchCount, totalCount, tier);
      db.prepare(`UPDATE votes SET session_id = ? WHERE id IN (${placeholders})`).run(
        sessionId,
        ...voteIds
      );
    });
    run();

    res.json({ sessionId, matchCount, totalCount, tier, percentile, totalSessions });
  });

  return router;
}

module.exports = { createSessionsRouter };
