const PROFILE_KEY = 'heibonVote.profile';

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
