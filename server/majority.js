// 同数の場合はsort_orderが小さい(お題定義で先に書かれた)選択肢を多数派とみなす。
function getMajorityOptionId(db, topicId) {
  const row = db
    .prepare(
      `SELECT o.id AS option_id, COUNT(v.id) AS vote_count
       FROM options o
       LEFT JOIN votes v ON v.topic_id = o.topic_id AND v.option_id = o.id
       WHERE o.topic_id = ?
       GROUP BY o.id
       ORDER BY vote_count DESC, o.sort_order ASC
       LIMIT 1`
    )
    .get(topicId);
  return row ? row.option_id : null;
}

module.exports = { getMajorityOptionId };
