import { Suspense } from "react";
import SpotlightPhotosClient from "./SpotlightPhotosClient";

export const metadata = {
  title: "Spotlight Photos — TMRE",
  description: "Photography for the TMRE Spotlight listing.",
};

export default function SpotlightPhotosPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightPhotosClient />
    </Suspense>
  );
}
