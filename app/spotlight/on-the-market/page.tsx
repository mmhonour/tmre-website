import { Suspense } from "react";
import SpotlightComparablesClient from "../comparables/SpotlightComparablesClient";

export const metadata = {
  title: "Spotlight On The Market — TMRE",
  description:
    "On-market sale and rental comps for the TMRE Spotlight property.",
};

export default function SpotlightOnTheMarketPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightComparablesClient mode="on-the-market" />
    </Suspense>
  );
}
