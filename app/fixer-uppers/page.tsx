import FixerUppersClient from "./FixerUppersClient";
import { loadDealOfTheDayFssrSeed } from "@/lib/deal-of-the-day-fssr";
import { TMRE_TOWNS_LABEL } from "@/lib/tmre-towns";

export const metadata = {
  title: "Fixer Uppers / Demolitions — TMRE",
  description:
    `Handyman specials, teardowns, and buildable lots across ${TMRE_TOWNS_LABEL} — low price points with acreage to build on.`,
};

export default async function FixerUppersPage() {
  const seed = await loadDealOfTheDayFssrSeed("sale", "homes");

  return (
    <FixerUppersClient initialDotdDealsByTown={seed?.dealsByTown ?? null} />
  );
}
