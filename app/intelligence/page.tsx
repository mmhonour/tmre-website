import { Suspense } from "react";
import IntelligenceClient from "@/components/IntelligenceClient";
import { loadDealOfTheDayFssrSeed } from "@/lib/deal-of-the-day-fssr";
import { TMRE_CORE_TOWNS_LABEL } from "@/lib/tmre-towns";

export const metadata = {
  title: "Market Intelligence — TMRE",
  description:
    `Live deal board and snapshot for ${TMRE_CORE_TOWNS_LABEL}, CT. Every listing scored against our proprietary deal model.`,
};

export default async function IntelligencePage() {
  const seed = await loadDealOfTheDayFssrSeed("sale", "homes");

  return (
    <Suspense fallback={null}>
      <IntelligenceClient
        initialDotdDealsByTown={seed?.dealsByTown ?? null}
      />
    </Suspense>
  );
}
