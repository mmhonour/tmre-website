import type { ReactNode } from "react";

/**
 * Full-bleed type wash — lighter blue, strongest in the middle, transparent
 * at the sides. Type stays fully opaque; only the wash fades.
 * Tailwind gradient is the runtime source so the class still paints if
 * globals.css has not rebuilt yet.
 */
export const listingShowcaseWashClass =
  "listing-showcase-type-wash bg-[linear-gradient(90deg,rgb(120_160_220/0)_0%,rgb(120_160_220/0.38)_22%,rgb(130_172_230/0.72)_50%,rgb(120_160_220/0.38)_78%,rgb(120_160_220/0)_100%)]";

export function ListingShowcaseTypeWash({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${listingShowcaseWashClass} ${className}`.trim()}>
      {children}
    </div>
  );
}
