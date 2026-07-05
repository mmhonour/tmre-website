import { Suspense } from "react";
import SpotlightIfClient from "./SpotlightIfClient";

export const metadata = {
  title: "Spotlight If — TMRE",
  description: "If scenarios for the TMRE Spotlight property.",
};

export default function SpotlightIfPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightIfClient />
    </Suspense>
  );
}
