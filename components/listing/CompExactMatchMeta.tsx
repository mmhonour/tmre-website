import type { ReactNode } from "react";

/** True when both sides are known and equal (half-baths included). */
export function isExactBedOrBathMatch(
  subject: number | null | undefined,
  comp: number | null | undefined,
): boolean {
  if (subject == null || comp == null) return false;
  if (!Number.isFinite(subject) || !Number.isFinite(comp)) return false;
  return subject === comp;
}

/**
 * Beds / baths meta with green highlight on exact match vs the subject listing.
 * Returns a React node so unmatched parts keep the muted parent color.
 */
export function renderCompBedBathMeta(options: {
  beds: number | null | undefined;
  baths: number | null | undefined;
  subjectBeds?: number | null;
  subjectBaths?: number | null;
  /** Class applied to exact-match segments (default sage). */
  matchClassName?: string;
}): ReactNode {
  const {
    beds,
    baths,
    subjectBeds = null,
    subjectBaths = null,
    matchClassName = "text-sage",
  } = options;

  const parts: ReactNode[] = [];
  if (beds != null) {
    const exact = isExactBedOrBathMatch(subjectBeds, beds);
    parts.push(
      <span key="beds" className={exact ? matchClassName : undefined}>
        {beds} bd
      </span>,
    );
  }
  if (baths != null) {
    const exact = isExactBedOrBathMatch(subjectBaths, baths);
    parts.push(
      <span key="baths" className={exact ? matchClassName : undefined}>
        {baths} ba
      </span>,
    );
  }
  if (parts.length === 0) return "—";

  return parts.reduce<ReactNode[]>((acc, part, index) => {
    if (index > 0) {
      acc.push(
        <span key={`sep-${index}`} aria-hidden>
          {" · "}
        </span>,
      );
    }
    acc.push(part);
    return acc;
  }, []);
}

/** Legend shown at the top of Sold / Rented / On Market / UAG panels. */
export function CompExactMatchLegend({
  theme = "dark",
}: {
  theme?: "dark" | "light";
}) {
  const base =
    theme === "light"
      ? "font-mono text-[9px] tracking-[0.12em] uppercase text-slate/70"
      : "font-mono text-[9px] tracking-[0.12em] uppercase text-white/40";
  return (
    <p className={`${base} mt-1`} role="note">
      <span className="font-semibold text-sage">Green</span>
      {" = exact match"}
    </p>
  );
}
