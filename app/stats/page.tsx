import StatsClient from "./StatsClient";
import { getActiveCoverageTownsLabel } from "@/lib/ct-coverage";
import { Suspense } from "react";

export async function generateMetadata() {
  const townsLabel = await getActiveCoverageTownsLabel();
  return {
    title: "Market Stats — TMRE",
    description: `Live market statistics for ${townsLabel}, CT — median price, days on market, price per sqft, and more.`,
  };
}

export default function StatsPage() {
  return (
    <Suspense fallback={null}>
      <StatsClient />
    </Suspense>
  );
}
