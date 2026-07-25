import DealOfTheWeekHero from "@/components/DealOfTheWeekHero";
import { loadDealOfTheDayFssrSeed } from "@/lib/deal-of-the-day-fssr";
import { TMRE_TOWNS_LABEL } from "@/lib/tmre-towns";
import { Suspense } from "react";

export const metadata = {
  title: "Deal of the Day — TMRE",
  description:
    `Today's best below-median value pick in ${TMRE_TOWNS_LABEL} — established homes and rentals, not new construction.`,
};

export default async function DealOfTheDayPage() {
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
