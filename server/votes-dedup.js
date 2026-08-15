// 同じ端末(voter_id)が同じお題に複数回答している場合、集計には最新の1票だけを使う。
// voter_idがない行(旧データ)は、それぞれ個別の1票としてそのまま数える。
function getLatestRealVoteRows(db, topicId) {
  return db
    .prepare(
      `SELECT id, option_id AS optionId, profile_json AS profileJson
       FROM (
         SELECT id, option_id, profile_json,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(voter_id, 'anon-' || id) ORDER BY id DESC
           ) AS rn
         FROM votes
         WHERE topic_id = ? AND is_dummy = 0
       )
       WHERE rn = 1`
    )
    .all(topicId);
}

module.exports = { getLatestRealVoteRows };
