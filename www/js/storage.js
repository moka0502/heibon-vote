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
