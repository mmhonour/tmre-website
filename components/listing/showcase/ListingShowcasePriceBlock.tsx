/** Offered at / Closed at on the full-bleed hero. Wash fades; type does not. */
export function ListingShowcasePriceBlock({
  label,
  amount,
}: {
  label: string;
  amount: string;
}) {
  return (
    <div className="listing-showcase-price-wash min-w-[12.5rem] bg-[linear-gradient(90deg,rgb(120_160_220/0)_0%,rgb(120_160_220/0.38)_22%,rgb(130_172_230/0.72)_50%,rgb(120_160_220/0.38)_78%,rgb(120_160_220/0)_100%)] px-6 py-2.5 text-right">
      <p className="relative font-mono text-[10px] uppercase tracking-[0.25em] text-white/65">
        {label}
      </p>
      <p className="relative mt-1 font-serif text-3xl font-bold tabular-nums leading-none text-gold lg:text-4xl">
        {amount}
      </p>
    </div>
  );
}
