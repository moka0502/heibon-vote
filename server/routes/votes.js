const express = require('express');
const { getVoteCounts, percentagesFor } = require('../majority');

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
    // voterIdも同様に型検証する(2026-08-18、開発運用者ペルソナの意地悪テストで発見:
    // voterIdにオブジェクト/配列/真偽値を渡すと、SQLバインドで例外が投げられ400ではなく
    // 500になっていた。topicId/optionIdと同じ横展開の漏れ)。未指定(null/undefined)は許容。
    if (voterId != null && typeof voterId !== 'string') {
      res.status(400).json({ error: 'voterId must be a string' });
      return;
    }
    // profileはオブジェクト(年代/性別/血液型/利き手の既知キー)想定。配列・文字列・巨大JSON等の
    // 逸脱は受け付けず空扱いにする(同レビューの指摘: profile無検証で1MB級JSONが投票行に入り
    // DB肥大化・breakdown集計時のparse負荷増を招く)。既知の属性キー・文字列値のみ通す。
    const ALLOWED_PROFILE_KEYS = ['age', 'gender', 'blood_type', 'handedness'];
    let cleanProfile = {};
    if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
      for (const k of ALLOWED_PROFILE_KEYS) {
        if (typeof profile[k] === 'string') cleanProfile[k] = profile[k];
      }
    }
    if (!optionExists.get(topicId, optionId)) {
      res.status(404).json({ error: 'unknown topicId/optionId' });
      return;
    }

    // 自分の一票を数える前の分布で、多数派と「完全に同数(五分五分)か」を判定する。
    // 得票が"ぴったり同数"のときだけ、どちらを選んでも正解にする(2026-08-18、実プレイFB:
    // 「完全互角の時だけ。どんなにちっちゃい差でも、多数決じゃなければ×」)。
    // わずかでも差があれば少数派は従来通り不一致。
    const preCounts = getVoteCounts(db, topicId);
    const preTotal = preCounts.reduce((sum, c) => sum + c.count, 0);
    let majority = preCounts[0];
    for (const c of preCounts) if (c.count > majority.count) majority = c; // 同数はsort_order先頭
    const secondMax = Math.max(...preCounts.filter((c) => c !== majority).map((c) => c.count), -1);
    const isTie = preTotal > 0 && majority.count === secondMax; // 最多と次点が完全同数=五分五分
    // 完全互角なら「選んだ方＝正解」として保存(セッションの一致数も match として数えられる)。
    const effectiveMajorityId = isTie ? optionId : majority.optionId;

    const result = insertVote.run(
      topicId,
      optionId,
      JSON.stringify(cleanProfile),
      voterId ?? null,
      effectiveMajorityId
    );

    // 自分の一票を含めた最新の内訳を、そのまま画面のフィードバックに使う
    const counts = getVoteCounts(db, topicId);
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    const percentages = percentagesFor(counts);

    // 50.1対49.9のような僅差が「50/50」に丸められて"互角なのに✕"に見える怖さへの対処として、
    // クライアントが接戦時だけ小数第1位を出せるよう、生の得票数も返す(2026-08-18、実プレイFB)。
    const voteCounts = Object.fromEntries(counts.map((c) => [c.optionId, c.count]));

    res.json({
      voteId: result.lastInsertRowid,
      isMajorityMatch: optionId === effectiveMajorityId,
      majorityOptionId: effectiveMajorityId,
      isTie,
      percentages,
      voteCounts,
      totalVotes: total,
    });
  });

  return router;
}

module.exports = { createVotesRouter };
