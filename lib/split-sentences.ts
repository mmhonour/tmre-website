const ABBREV = /\b(Mr|Mrs|Ms|Dr|St|Ave|Blvd|Sq|vs|etc|Inc|Ltd)\./gi;
const DECIMAL = /(\d)\.(\d)/g;
const SQFT = /\bsq\.ft\./gi;
const PLACEHOLDER = "\u0000";

/** Split prose into sentences for display; protects decimals and common abbreviations. */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const protectedText = trimmed
    .replace(DECIMAL, `$1${PLACEHOLDER}$2`)
    .replace(SQFT, `sq${PLACEHOLDER}ft${PLACEHOLDER}`)
    .replace(ABBREV, `$1${PLACEHOLDER}`);

  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replaceAll(PLACEHOLDER, ".").trim())
    .filter(Boolean);
}
