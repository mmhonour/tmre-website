import IntelligenceListingsClient from "@/components/IntelligenceListingsClient";
import { Suspense } from "react";

export const metadata = {
  title: "Listings — Market Intelligence — TMRE",
  description: "Filtered active listings from TMRE Market Intelligence snapshots.",
};

export default function IntelligenceListingsPage() {
  return (
    <Suspense fallback={null}>
      <IntelligenceListingsClient />
    </Suspense>
  );
}
