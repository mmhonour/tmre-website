import { Suspense } from "react";
import SpotlightComparablesClient from "../comparables/SpotlightComparablesClient";

export const metadata = {
  title: "Spotlight Under Agreement — TMRE",
  description: "Under-contract comparable listings for the TMRE Spotlight property.",
};

export default function SpotlightUagPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightComparablesClient mode="uag" />
    </Suspense>
  );
}
