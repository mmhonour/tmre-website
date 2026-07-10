import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";

export function listingHeaderScoreProps(input: {
  goldilocksScore?: number | null;
  goldilocksBreakdown?: ScoreBreakdown | null;
  title: string;
  subtitle?: string | null;
  propertyType?: string | null;
}) {
  return {
    goldilocksScore: input.goldilocksScore ?? null,
    goldilocksBreakdown: input.goldilocksBreakdown ?? null,
    scoreTitle: input.title,
    scoreSubtitle: input.subtitle ?? null,
    isRental: /rental|for lease/i.test(input.propertyType ?? ""),
  };
}

export type ListingScoreApiFields = {
  goldilocksScore?: number | null;
  goldilocksBreakdown?: ScoreBreakdown | null;
  edgeScore?: number | null;
  edgeScoreBreakdown?: Record<string, unknown> | null;
};
