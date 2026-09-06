import DealOfTheWeekHero from "@/components/DealOfTheWeekHero";
import { loadDealOfTheDayFssrSeed } from "@/lib/deal-of-the-day-fssr";
import { getActiveCoverageTownsLabel } from "@/lib/ct-coverage";
import { Suspense } from "react";

export async function generateMetadata() {
  const townsLabel = await getActiveCoverageTownsLabel();
  return {
    title: "Deal of the Day — TMRE",
    description: `Today's best below-median value pick in ${townsLabel} — established homes and rentals, not new construction.`,
  };
}

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
