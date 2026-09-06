import FixerUppersClient from "./FixerUppersClient";
import { loadDealOfTheDayFssrSeed } from "@/lib/deal-of-the-day-fssr";
import { getActiveCoverageTownsLabel } from "@/lib/ct-coverage";

export async function generateMetadata() {
  const townsLabel = await getActiveCoverageTownsLabel();
  return {
    title: "Fixer Uppers / Demolitions — TMRE",
    description: `Handyman specials, teardowns, and buildable lots across ${townsLabel} — low price points with acreage to build on.`,
  };
}

export default async function FixerUppersPage() {
  const seed = await loadDealOfTheDayFssrSeed("sale", "homes");

  return (
    <FixerUppersClient initialDotdDealsByTown={seed?.dealsByTown ?? null} />
  );
}
