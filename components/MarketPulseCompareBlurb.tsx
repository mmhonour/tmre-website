"use client";

export default function MarketPulseCompareBlurb({
  caption,
  lines,
}: {
  caption: string;
  lines: { id: string; label: string; text: string }[];
}) {
  return (
    <aside className="flex w-[6.75rem] shrink-0 flex-col justify-center border-l border-[var(--mp-hairline,rgba(0,0,0,0.08))] pl-2">
      <p className="[font-family:var(--mp-mono-font)] text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--mp-accent,#C8A951)]">
        {caption}
      </p>
      {lines.length === 0 ? (
        <p className="mt-1 [font-family:var(--mp-mono-font)] text-[9px] leading-snug text-[var(--mp-muted-text)]">
          flat
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {lines.map((line) => (
            <li
              key={line.id}
              className="[font-family:var(--mp-mono-font)] text-[9px] leading-snug tabular-nums text-[var(--mp-muted-text)]"
            >
              <span className="text-[var(--mp-text)]/70">{line.label}</span>{" "}
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
