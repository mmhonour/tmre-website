import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";

export type DealBoardRowStatus = "Active" | "Pending" | "New" | "Reduced";

export type DealBoardStatusFilter = "all" | "new" | "reduced" | "active";

export type DealBoardListing = {
  key: string;
  listingKey?: string | null;
  score: number;
  scoreBreakdown?: ScoreBreakdown | null;
  address: string;
  city?: string | null;
  type: string;
  price: number;
  pricePerSqft: number | null;
  sqft: number | null;
  lotAcres?: number | null;
  dom: number | null;
  status: DealBoardRowStatus;
  isRental: boolean;
  beds?: number | null;
  baths?: number | null;
  yearBuilt?: number | null;
  headline: string;
  photoCount?: number | null;
  /** First RETS photo index that actually downloaded (skips empty MLS slots). */
  primaryPhotoIndex?: number | null;
};

export type DealBoardRowProps = {
  listing: DealBoardListing;
  scoreRank: number;
  rankTotal: number;
  isLive: boolean;
  showTown: boolean;
  onScoreClick: (listing: DealBoardListing) => void;
  onStatusClick?: (listing: DealBoardListing) => void;
};
