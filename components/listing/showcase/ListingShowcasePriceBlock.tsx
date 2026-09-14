import { ListingShowcaseTypeWash } from "@/components/listing/showcase/listing-showcase-wash";

/** Offered at / Closed at on the full-bleed hero. Wash fades; type does not. */
export function ListingShowcasePriceBlock({
  label,
  amount,
}: {
  label: string;
  amount: string;
}) {
  return (
    <ListingShowcaseTypeWash className="overflow-visible px-8 py-1.5 text-right max-lg:pr-3 lg:py-2.5">
      <p className="relative whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.25em] text-white/65">
        {label}
      </p>
      <p className="relative mt-1 whitespace-nowrap font-serif text-3xl font-bold tabular-nums leading-none text-gold lg:text-4xl">
        {amount}
      </p>
    </ListingShowcaseTypeWash>
  );
}
