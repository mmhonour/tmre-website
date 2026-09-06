import { Suspense } from "react";
import SpotlightShowcaseClient from "../SpotlightShowcaseClient";

export const metadata = {
  title: "Spotlight Photos — TMRE",
  description: "Photography for the TMRE Spotlight listing.",
};

export default function SpotlightPhotosPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightShowcaseClient initialTab="photos" />
    </Suspense>
  );
}
