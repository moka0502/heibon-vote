// Tailscale経由等の不安定な回線で、応答がないまま「読み込み中」が続くのを防ぐ
// (2026-08-16、公開前の既知タスクへの対応)。タイムアウト時のエラーは既存の
// mountError(showLoading→エラー画面)にそのまま乗る。
const REQUEST_TIMEOUT_MS = 15000;

async function request(path, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(path, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('通信がタイムアウトしました。通信環境を確認してから、もう一度お試しください。');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getAttributes: () => request('/api/attributes'),
  getCategories: () => request('/api/categories'),
  getRandomTopics: (count, category, part) =>
    request(
      `/api/topics/random?count=${count}${category ? `&category=${encodeURIComponent(category)}` : ''}${part ? `&part=${part}` : ''}`
    ),
  getAllTopics: () => request('/api/topics'),
  getTopicBreakdown: (topicId) => request(`/api/topics/${topicId}/breakdown`),
  postVote: (payload) =>
    request('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  postSession: (voteIds, voterId) =>
    request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voteIds, voterId }),
    }),
  getSessions: (voterId) => request(`/api/sessions?voterId=${encodeURIComponent(voterId)}`),
  getSession: (id) => request(`/api/sessions/${id}`),
  getSessionStats: (voterId) => request(`/api/sessions/stats?voterId=${encodeURIComponent(voterId)}`),
  postSuggestion: (text) =>
    request('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
};
