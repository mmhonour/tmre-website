import { Suspense } from "react";
import DealOfTheWeekHero from "@/components/DealOfTheWeekHero";
import { loadDealOfTheDayFssrSeed } from "@/lib/deal-of-the-day-fssr";

/** Same seed as `/deal-of-the-day` — weekly cache, not fixture towns. */
export async function DodTownBleedLive() {
  const seed = await loadDealOfTheDayFssrSeed("sale", "homes");

  return (
    <Suspense fallback={null}>
      <DealOfTheWeekHero
        mode="day"
        initialDealsByTown={seed?.dealsByTown ?? null}
        initialKind={seed?.kind ?? "sale"}
        initialPropertyClass={seed?.propertyClass ?? "homes"}
      />
    </Suspense>
  );
}
