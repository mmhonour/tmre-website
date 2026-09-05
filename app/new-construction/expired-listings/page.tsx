import type { Metadata } from "next";
import ExpiredListingsClient from "./ExpiredListingsClient";
import { getActiveCoverageTownsLabel } from "@/lib/ct-coverage";

export async function generateMetadata(): Promise<Metadata> {
  const townsLabel = await getActiveCoverageTownsLabel();
  return {
    title: "Expired Listings — TMRE",
    description: `Expired MLS listings across ${townsLabel}, CT — off-market for 30+ days. Sourced live from SmartMLS.`,
  };
}

export default function ExpiredListingsPage() {
  return <ExpiredListingsClient />;
}
