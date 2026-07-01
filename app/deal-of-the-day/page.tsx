import DealOfTheWeekHero from "@/components/DealOfTheWeekHero";
import { TMRE_TOWNS_LABEL } from "@/lib/tmre-towns";
import { Suspense } from "react";

export const metadata = {
  title: "Deal of the Day — TMRE",
  description:
    `Today's best below-median value pick in ${TMRE_TOWNS_LABEL} — established homes and rentals, not new construction.`,
};

export default function DealOfTheDayPage() {
  return (
    <Suspense fallback={null}>
      <DealOfTheWeekHero mode="day" />
    </Suspense>
  );
}
