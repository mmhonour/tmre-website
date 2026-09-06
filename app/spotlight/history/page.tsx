import { Suspense } from "react";
import SpotlightShowcaseClient from "../SpotlightShowcaseClient";

export const metadata = {
  title: "Spotlight History — TMRE",
  description: "Listing history for the TMRE Spotlight property.",
};

export default function SpotlightHistoryPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightShowcaseClient initialTab="history" />
    </Suspense>
  );
}
