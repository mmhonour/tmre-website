import type { ReactNode } from "react";

/**
 * Full-bleed type wash — same navy as the rail pills (`#0d1424`), strongest
 * in the middle, transparent at the sides. Type stays fully opaque.
 * Tailwind gradient is the runtime source so the class still paints if
 * globals.css has not rebuilt yet.
 */
export const listingShowcaseWashClass =
  "listing-showcase-type-wash bg-[linear-gradient(90deg,rgb(13_20_36/0)_0%,rgb(13_20_36/0.68)_22%,rgb(13_20_36/0.94)_50%,rgb(13_20_36/0.68)_78%,rgb(13_20_36/0)_100%)]";

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
