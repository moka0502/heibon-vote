const { getLatestRealVoteRows } = require('./votes-dedup');

// 実データ(is_dummy=0、同一voter_idは最新1票のみ)が一定数貯まったお題は、
// ダミー票を混ぜずに実データだけを多数派判定の母集団とする
// (2026-08-15指示: 実データが正になったら実データを正とする。そのお題のダミー票は削除する)。
const REAL_VOTE_MAJORITY_THRESHOLD = 100;

// 選択肢ごとの現在の得票数(sort_order順)。実データが閾値を超えていればダミー票は
// 数えず、その場でダミー票を削除する(⑨: 実データが正になったら要らないダミーは消す)。
function getVoteCounts(db, topicId) {
  const realVotes = getLatestRealVoteRows(db, topicId);
  const useRealVotesOnly = realVotes.length >= REAL_VOTE_MAJORITY_THRESHOLD;

  if (useRealVotesOnly) {
    db.prepare('DELETE FROM votes WHERE topic_id = ? AND is_dummy = 1').run(topicId);
  }

  const options = db
    .prepare('SELECT id, sort_order FROM options WHERE topic_id = ? ORDER BY sort_order')
    .all(topicId);
  const counts = new Map(options.map((o) => [o.id, 0]));

  if (useRealVotesOnly) {
    for (const v of realVotes) counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);
  } else {
    const dummyVotes = db
      .prepare('SELECT option_id AS optionId FROM votes WHERE topic_id = ? AND is_dummy = 1')
      .all(topicId);
    for (const v of dummyVotes) counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);
    for (const v of realVotes) counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);
  }

  return options.map((o) => ({ optionId: o.id, count: counts.get(o.id) ?? 0 }));
}

// 同数の場合はsort_orderが小さい(お題定義で先に書かれた)選択肢を多数派とみなす。
function getMajorityOptionId(db, topicId) {
  const counts = getVoteCounts(db, topicId);
  let best = null;
  for (const c of counts) {
    if (!best || c.count > best.count) best = c;
  }
  return best ? best.optionId : null;
}

module.exports = { getMajorityOptionId, getVoteCounts, REAL_VOTE_MAJORITY_THRESHOLD };
