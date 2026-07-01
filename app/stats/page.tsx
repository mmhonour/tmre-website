import StatsClient from "./StatsClient";
import { TMRE_TOWNS_LABEL } from "@/lib/tmre-towns";
import { Suspense } from "react";

export const metadata = {
  title: "Market Stats — TMRE",
  description:
    `Live market statistics for ${TMRE_TOWNS_LABEL}, CT — median price, days on market, price per sqft, and more.`,
};

export default function StatsPage() {
  return (
    <Suspense fallback={null}>
      <StatsClient />
    </Suspense>
  );
}
