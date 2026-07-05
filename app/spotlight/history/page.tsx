import { Suspense } from "react";
import SpotlightHistoryClient from "./SpotlightHistoryClient";

export const metadata = {
  title: "Spotlight History — TMRE",
  description: "Listing history for the TMRE Spotlight property.",
};

export default function SpotlightHistoryPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightHistoryClient />
    </Suspense>
  );
}
