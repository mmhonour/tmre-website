import { Suspense } from "react";
import SpotlightShowcaseClient from "../SpotlightShowcaseClient";

export const metadata = {
  title: "Spotlight Comparable Rentals — TMRE",
  description:
    "Comparable leased and active rentals for the TMRE Spotlight property.",
};

export default function SpotlightComparableRentalsPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightShowcaseClient initialTab="comparable-rentals" />
    </Suspense>
  );
}
