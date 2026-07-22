/**
 * Split on sentence-ending punctuation, but never on decimal points inside
 * amounts like `$4.37/sqft`.
 */
function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts: string[] = [];
  const endPunct = /[.!?]+(?=\s|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = endPunct.exec(trimmed))) {
    const end = match.index + match[0].length;
    parts.push(trimmed.slice(last, end).trim());
    last = end;
  }
  if (last < trimmed.length) {
    parts.push(trimmed.slice(last).trim());
  }
  return parts.filter(Boolean);
}

/** Matches `($465/sqft)` or `($2.10/sqft)` from insight median copy. */
const MEDIAN_PPSF_TOKEN = /(\(\$\d[\d,]*(?:\.\d{2})?\/sqft\))/;

function renderSentenceWithMedianLink(
  sentence: string,
  medianHref: string,
  className: string,
  key: number,
) {
  const match = MEDIAN_PPSF_TOKEN.exec(sentence);
  if (!match || match.index == null) {
    return (
      <p key={key} className={className}>
        {sentence}
      </p>
    );
  }
  const start = match.index;
  const token = match[1];
  const before = sentence.slice(0, start);
  const after = sentence.slice(start + token.length);
  // Link only the dollar amount inside the parens: ($2.10/sqft) → ( + link + )
  const inner = token.slice(1, -1);
  return (
    <p key={key} className={className}>
      {before}(
      <a
        href={medianHref}
        className="text-gold underline decoration-gold/40 underline-offset-2 hover:text-gold-light hover:decoration-gold/70"
      >
        {inner}
      </a>
      ){after}
    </p>
  );
}

export function ListingInsightCopy({
  text,
  className = "text-sm text-white/60 leading-relaxed",
  medianHref = null,
}: {
  text: string;
  className?: string;
  /** When set (listing / Spotlight only), links the median `$…/sqft` to Analysis. */
  medianHref?: string | null;
}) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return null;

  if (!medianHref) {
    if (sentences.length <= 1) {
      return <p className={className}>{text}</p>;
    }
    return (
      <div className="space-y-2">
        {sentences.map((sentence, index) => (
          <p key={index} className={className}>
            {sentence}
          </p>
        ))}
      </div>
    );
  }

  if (sentences.length <= 1) {
    return renderSentenceWithMedianLink(text, medianHref, className, 0);
  }

  return (
    <div className="space-y-2">
      {sentences.map((sentence, index) =>
        renderSentenceWithMedianLink(sentence, medianHref, className, index),
      )}
    </div>
  );
}
