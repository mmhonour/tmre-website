/**
 * Whole-word / whole-phrase matching for listing remarks.
 * Avoids substring false positives (e.g. "dated" inside "updated").
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * True when `phrase` appears in `haystack` as a complete word or multi-word
 * phrase (case-insensitive). Letters/digits adjacent to either end block a match.
 */
export function remarksPhraseMatches(
  haystack: string,
  phrase: string,
): boolean {
  const trimmed = phrase.trim().toLowerCase()
  if (!trimmed) return false
  const parts = trimmed.split(/\s+/).map(escapeRegExp)
  if (parts.length === 0 || parts.some((p) => !p)) return false
  const pattern = parts.join('\\s+')
  // (?<![a-z0-9]) / (?![a-z0-9]) — word-ish edges that still allow hyphens
  // and apostrophes inside the phrase (as-is, chef's kitchen).
  const re = new RegExp(`(?<![a-z0-9])${pattern}(?![a-z0-9])`, 'i')
  return re.test(haystack)
}

/** Phrases from `needles` that match as whole words/phrases in `haystack`. */
export function matchedRemarkPhrases(
  haystack: string,
  needles: readonly string[],
): string[] {
  return needles.filter((n) => remarksPhraseMatches(haystack, n))
}
