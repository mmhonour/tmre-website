import { Suspense } from "react";
import SpotlightComparablesClient from "../comparables/SpotlightComparablesClient";

export const metadata = {
  title: "Spotlight Comparable Rentals — TMRE",
  description:
    "Comparable leased and active rentals for the TMRE Spotlight property.",
};

export default function SpotlightComparableRentalsPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightComparablesClient comparablesKind="rental" />
    </Suspense>
  );
}
