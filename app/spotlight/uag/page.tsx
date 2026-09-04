import { Suspense } from "react";
import SpotlightShowcaseClient from "../SpotlightShowcaseClient";

export const metadata = {
  title: "Spotlight Under Agreement — TMRE",
  description: "Under-contract comparable listings for the TMRE Spotlight property.",
};

export default function SpotlightUagPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightShowcaseClient initialTab="uag" />
    </Suspense>
  );
}
