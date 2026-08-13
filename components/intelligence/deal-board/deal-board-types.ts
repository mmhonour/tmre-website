import type { ScoreBreakdown } from "@/lib/goldilocks-score-info";

/**
 * Board signal statuses. "Coming Soon" / "Back on Market" are produced only by
 * the Latest feed (LatestListingRow), which renders through the same row shells.
 */
export type DealBoardRowStatus =
  | "Active"
  | "Pending"
  | "New"
  | "Reduced"
  | "Increased"
  | "Coming Soon"
  | "Back on Market";

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
  /**
   * Under-contract MLS sub-status pill ("Under Contract" / "Continue to Show"),
   * shown beside the board New/Reduced/Active signal when applicable.
   */
  contractStatus?: string | null;
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
  /** When Sale or Rental filter is on, omit ownership/type from the meta line. */
  hideOwnershipType?: boolean;
  /** Extra facts under beds/price (more data / less data). All board views. */
  showGridMeta?: boolean;
  /** Listing insight headline (insights toggle). All board views. */
  showGridInsights?: boolean;
  /**
   * When set, overrides score-rank photo eager-loading.
   * Used when the board batches rows (100+ results → first 20 photos first).
   */
  photoPriority?: boolean;
  onScoreClick: (listing: DealBoardListing) => void;
  onStatusClick?: (listing: DealBoardListing) => void;
};
