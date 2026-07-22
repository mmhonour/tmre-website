import type { MedianPpsfBand } from "@/lib/insight-median-ppsf";
import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";

export function listingHeaderScoreProps(input: {
  goldilocksScore?: number | null;
  goldilocksBreakdown?: ScoreBreakdown | null;
  insight?: string | null;
  title: string;
  subtitle?: string | null;
  propertyType?: string | null;
}) {
  return {
    goldilocksScore: input.goldilocksScore ?? null,
    goldilocksBreakdown: input.goldilocksBreakdown ?? null,
    insight: input.insight?.trim() || null,
    scoreTitle: input.title,
    scoreSubtitle: input.subtitle ?? null,
    isRental: /rental|for lease/i.test(input.propertyType ?? ""),
  };
}

export type ListingScoreApiFields = {
  goldilocksScore?: number | null;
  goldilocksBreakdown?: ScoreBreakdown | null;
  insight?: string | null;
  cityMedianPpsf?: number | null;
  pricePerSqft?: number | null;
  medianPpsfBand?: MedianPpsfBand | null;
  edgeScore?: number | null;
  edgeScoreBreakdown?: Record<string, unknown> | null;
};
