// 閾値は2026-08-15、実際のお題(questions-seed.json)のdummyVotes比率を使ったモンテカルロ
// シミュレーション(母集団分布どおりに回答する「典型的な人」を20000セッション分試算)で検証済み。
// 元の閾値(個性派>=0.2)だと「唯一無二」の出現率が0.02%(20000回中4回)しかなく実質到達不能だったため、
// 0.3に引き上げて約0.4%(1/250程度)まで緩和した。「個性あり」(0.5〜0.8)は64.8%とちょうど良い塊になっており
// 妥当と判断、変更なし。
// ラベル文言は2026-08-16、「平凡=つまらない」ではなく「平凡=共感力があって王道」という
// アプリの根っこの主張(イントロ画面の「『平凡』は、実はすごい」)に一貫させる形で言い換えた
// (かなり平凡→平凡寄り、平凡→個性あり)。閾値の数字自体は変更していない。
function sessionTierFor(matchCount, totalCount) {
  if (matchCount === totalCount) return '真の平凡(今回)';
  const ratio = matchCount / totalCount;
  if (ratio >= 0.8) return '平凡寄り';
  if (ratio >= 0.5) return '個性あり';
  if (ratio >= 0.3) return '個性派';
  return '唯一無二';
}

function lifetimeTitleFor(perfectSessionCount) {
  if (perfectSessionCount >= 10) return '真の平凡';
  if (perfectSessionCount >= 3) return '平凡上級者';
  if (perfectSessionCount >= 1) return '平凡の卵';
  return null;
}

module.exports = { sessionTierFor, lifetimeTitleFor };
