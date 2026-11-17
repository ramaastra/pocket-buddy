export type Session = { user: { id: string; email: string; name?: string }; csrfToken: string };

export function avatarInitial(session: Session | null) {
  if (!session) return 'D';
  const words = (session.user.name ?? '').trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  const value = initials.map((word) => Array.from(word)[0]).join('');
  return (value || Array.from(session.user.email)[0] || 'D').toLocaleUpperCase();
}
