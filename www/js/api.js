async function request(path, options) {
  const res = await fetch(path, options);
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
