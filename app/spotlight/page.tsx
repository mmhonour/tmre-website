import { Suspense } from "react";
import SpotlightPageClient from "./SpotlightPageClient";

export const metadata = {
  title: "Spotlight — TMRE",
  description:
    "TMRE Spotlight — a featured Westport listing preview. Register interest before it hits the market.",
  alternates: {
    canonical: "/spotlight",
  },
};

export default function SpotlightPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightPageClient />
    </Suspense>
  );
}
