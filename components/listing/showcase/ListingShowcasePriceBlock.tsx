/** Offered at / Closed at on the full-bleed hero. Wash fades; type does not. */
export function ListingShowcasePriceBlock({
  label,
  amount,
}: {
  label: string;
  amount: string;
}) {
  return (
    <div className="listing-showcase-price-wash min-w-[11rem] px-5 py-2 text-right">
      <p className="relative font-mono text-[10px] uppercase tracking-[0.25em] text-white/65">
        {label}
      </p>
      <p className="relative mt-1 font-serif text-3xl font-bold tabular-nums leading-none text-gold lg:text-4xl">
        {amount}
      </p>
    </div>
  );
}
