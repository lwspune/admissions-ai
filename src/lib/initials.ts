/**
 * An avatar's letters: the first letter or digit of each of the first two
 * words that have one. Names arrive as people typed them on Instagram or
 * WhatsApp, emoji and all, and `word[0]` takes the first UTF-16 unit, which
 * for an emoji is half of it: the server then rendered "�" where the browser
 * kept the half, and React threw the page's hydration away (2026-10-26).
 */
export function initials(name: string | null): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
}
