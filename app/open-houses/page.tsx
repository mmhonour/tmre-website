import type { Metadata } from "next";
import OpenHousesClient from "./OpenHousesClient";
import { getActiveCoverageTownsLabel } from "@/lib/ct-coverage";
import { loadOpenHousesPageData } from "@/lib/open-houses-page-data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const townsLabel = await getActiveCoverageTownsLabel();
  return {
    title: "Open Houses — TMRE",
    description: `Upcoming open houses across ${townsLabel}, CT — public showings remaining this week.`,
  };
}

export default async function OpenHousesPage() {
  const initial = await loadOpenHousesPageData();
  return <OpenHousesClient initial={initial} />;
}
