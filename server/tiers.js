function sessionTierFor(matchCount, totalCount) {
  if (matchCount === totalCount) return '真の平凡(今回)';
  const ratio = matchCount / totalCount;
  if (ratio >= 0.8) return 'かなり平凡';
  if (ratio >= 0.5) return '平凡';
  if (ratio >= 0.2) return '個性派';
  return '唯一無二';
}

function lifetimeTitleFor(perfectSessionCount) {
  if (perfectSessionCount >= 10) return '真の平凡';
  if (perfectSessionCount >= 3) return '平凡上級者';
  if (perfectSessionCount >= 1) return '平凡の卵';
  return null;
}

module.exports = { sessionTierFor, lifetimeTitleFor };
