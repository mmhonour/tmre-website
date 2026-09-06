import { Suspense } from "react";
import SpotlightShowcaseClient from "../SpotlightShowcaseClient";

export const metadata = {
  title: "Spotlight If — TMRE",
  description: "If scenarios for the TMRE Spotlight property.",
};

export default function SpotlightIfPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightShowcaseClient initialTab="if" />
    </Suspense>
  );
}
