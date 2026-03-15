export function parseTweetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/\/status(?:es)?\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
