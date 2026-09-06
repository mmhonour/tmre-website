import type { Metadata } from "next";
import OpenHousesClient from "./OpenHousesClient";
import { getActiveCoverageTownsLabel } from "@/lib/ct-coverage";

export async function generateMetadata(): Promise<Metadata> {
  const townsLabel = await getActiveCoverageTownsLabel();
  return {
    title: "Open Houses — TMRE",
    description: `Upcoming open houses across ${townsLabel}, CT — public showings in the next 7 days.`,
  };
}

export default function OpenHousesPage() {
  return <OpenHousesClient />;
}
