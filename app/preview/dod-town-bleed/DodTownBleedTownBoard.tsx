import { TMRE_TOWNS } from "@/lib/tmre-towns";
import { DodTownBleedStill } from "@/app/preview/dod-town-bleed/DodTownBleedStill";
import {
  loadDodTownBleedPreviewSeed,
  type DodTownBleedPreviewSeed,
} from "@/app/preview/dod-town-bleed/preview-seed";

/** One still per town — the listing photo is the bleed, labeled with that town’s paint. */
export async function DodTownBleedTownBoard({
  seed: seedProp,
}: {
  seed?: DodTownBleedPreviewSeed;
} = {}) {
  const seed = seedProp ?? (await loadDodTownBleedPreviewSeed());

  return (
    <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
        {seed.source === "live"
          ? "This week’s picks · one picture per town"
          : "Fixture towns · one picture per town"}
      </p>
      <h2 className="mb-2 font-serif text-2xl text-navy">
        Deal of the Day bleeds
      </h2>
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-slate">
        Each band is that town’s listing photo. “Today’s score / One
        listing” sits on the picture. The paint cycles with the
        carousel: edges meet, center lines out, then a line from the top.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {TMRE_TOWNS.map((town, index) => {
          const deal = seed.dealsByTown[town] ?? null;
          return (
            <DodTownBleedStill
              key={town}
              town={town}
              carouselIndex={index}
              score={deal?.score.composite ?? null}
              photoUrl={deal?.photoUrl ?? null}
              address={
                deal?.listing.address.street || deal?.listing.address.full || null
              }
            />
          );
        })}
      </div>
    </section>
  );
}
