import type { Metadata } from "next";
import NewConstructionClient from "./NewConstructionClient";
import { getActiveCoverageTownsLabel } from "@/lib/ct-coverage";

export async function generateMetadata(): Promise<Metadata> {
  const townsLabel = await getActiveCoverageTownsLabel();
  return {
    title: "New Construction — TMRE",
    description: `New construction homes across ${townsLabel}, CT. Sourced live and scored by TMRE.`,
  };
}

export default function NewConstructionPage() {
  return <NewConstructionClient />;
}
