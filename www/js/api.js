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
  getRandomTopics: (count) => request(`/api/topics/random?count=${count}`),
  getAllTopics: () => request('/api/topics'),
  getTopicBreakdown: (topicId) => request(`/api/topics/${topicId}/breakdown`),
  postVote: (payload) =>
    request('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  postSession: (voteIds) =>
    request('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voteIds }),
    }),
  getSessions: () => request('/api/sessions'),
  getSession: (id) => request(`/api/sessions/${id}`),
  getSessionStats: () => request('/api/sessions/stats'),
};
