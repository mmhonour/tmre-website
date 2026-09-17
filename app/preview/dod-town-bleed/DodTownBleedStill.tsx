"use client";

import DealDayTownBleed, {
  DEAL_TOWN_BLEED_LABELS,
  dealTownBleedPattern,
} from "@/components/DealDayTownBleed";

export function DodTownBleedStill({
  town,
  carouselIndex,
  score,
  photoUrl,
  address,
}: {
  town: string;
  carouselIndex: number;
  score: number | null;
  photoUrl: string | null;
  address: string | null;
}) {
  const pattern = dealTownBleedPattern(carouselIndex);
  const scoreLabel =
    score != null && Number.isFinite(score) ? `${score.toFixed(1)}.` : "—";

  return (
    <article className="overflow-hidden rounded-2xl navy-gradient shadow-[0_18px_40px_-24px_rgba(13,20,36,0.55)]">
      <div className="relative min-h-[200px]">
        <DealDayTownBleed
          carouselIndex={carouselIndex}
          photoUrl={photoUrl}
          photoAlt={address ? `${address}, ${town}` : town}
          playOnMount
        />
        <div className="relative z-[1] space-y-2 px-5 pt-5 pb-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/70">
            {town}, CT
          </p>
          <h3 className="font-serif text-3xl leading-[1.05] tracking-tight text-white">
            Today&apos;s{" "}
            <span className="italic gold-shimmer">{scoreLabel}</span>
            <br />
            <span className="italic text-white/85">One listing.</span>
          </h3>
        </div>
        <div className="relative z-[1] space-y-1 px-5 pb-4">
          {address ? (
            <p className="font-mono text-[11px] text-white/80">{address}</p>
          ) : (
            <p className="font-mono text-[11px] text-white/45">
              No below-median pick this week.
            </p>
          )}
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-gold/85">
            {DEAL_TOWN_BLEED_LABELS[pattern]}
          </p>
        </div>
      </div>
    </article>
  );
}
