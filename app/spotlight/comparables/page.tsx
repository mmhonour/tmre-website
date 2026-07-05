import { Suspense } from "react";
import SpotlightComparablesClient from "./SpotlightComparablesClient";

export const metadata = {
  title: "Spotlight Comparables — TMRE",
  description: "Comparable sales and listings for the TMRE Spotlight property.",
};

export default function SpotlightComparablesPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightComparablesClient />
    </Suspense>
  );
}
