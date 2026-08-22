const PROFILE_KEY = 'heibonVote.profile';
const VOTER_ID_KEY = 'heibonVote.voterId';

// 同じ端末からの複数回答を「最新1票」に絞って集計するための匿名ID。
// ログイン機能がないため、これが実質的な「回答者」の識別子になる。
export function getVoterId() {
  let voterId = localStorage.getItem(VOTER_ID_KEY);
  if (!voterId) {
    voterId = crypto.randomUUID();
    localStorage.setItem(VOTER_ID_KEY, voterId);
  }
  return voterId;
}

export function getProfile() {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.values ?? null;
  } catch {
    return null;
  }
}

export function saveProfile(values) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, values }));
}

const QUIZ_STATE_KEY = 'heibonVote.quizState';

// クイズ途中でアプリが強制終了/バックグラウンド化でkillされても復帰できるよう、
// 1問答えるたびに進行状態を保存する。バックグラウンド復帰時の状態継続への対応(2026-08-15)。
export function saveQuizState(state) {
  localStorage.setItem(QUIZ_STATE_KEY, JSON.stringify(state));
}

export function getQuizState() {
  const raw = localStorage.getItem(QUIZ_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearQuizState() {
  localStorage.removeItem(QUIZ_STATE_KEY);
}

// 挑戦済みのカテゴリ+Partを覚えておき、カテゴリ選択画面で「挑戦済み」を出す(継続利用の手がかり)。
const PLAYED_PARTS_KEY = 'heibonVote.playedParts';

export function getPlayedParts() {
  try {
    const arr = JSON.parse(localStorage.getItem(PLAYED_PARTS_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function markPlayed(category, part) {
  if (!category || !part) return; // ランダム(カテゴリ無し)は記録しない
  const key = `${category}:${part}`;
  const set = new Set(getPlayedParts());
  set.add(key);
  localStorage.setItem(PLAYED_PARTS_KEY, JSON.stringify([...set]));
}

// レビュー依頼(App Storeの★)の出し分けに使う記録。
// Appleは1年に3回までしかレビューダイアログを表示しないため、条件を絞って
// 「良い体験の直後」だけに寄せる(RELEASE-KIT 2章)。判定は端末単位で完結させる
// (レビュー依頼の表示制限自体が端末単位のため、サーバーに置く意味がない)。
const PLAY_COUNT_KEY = 'heibonVote.playCount';
const REVIEW_ASKED_AT_KEY = 'heibonVote.reviewAskedAt';

// 完走(結果画面に到達)した回数。満点回数(サーバー側のperfectCount)とは別物。
export function getPlayCount() {
  const raw = Number(localStorage.getItem(PLAY_COUNT_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function incrementPlayCount() {
  const next = getPlayCount() + 1;
  localStorage.setItem(PLAY_COUNT_KEY, String(next));
  return next;
}

export function getReviewAskedAt() {
  const raw = Number(localStorage.getItem(REVIEW_ASKED_AT_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function markReviewAsked(now = Date.now()) {
  localStorage.setItem(REVIEW_ASKED_AT_KEY, String(now));
}

