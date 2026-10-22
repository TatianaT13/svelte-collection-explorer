/** Emoji drapeau à partir d'un code ISO 3166-1 alpha-2 ("UA" → 🇺🇦). */
export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
