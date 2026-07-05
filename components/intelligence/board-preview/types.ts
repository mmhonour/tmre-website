export type BoardPreviewStatus = "Active" | "Pending" | "New" | "Reduced";

export type BoardPreviewListing = {
  key: string;
  score: number;
  address: string;
  city: string;
  type: string;
  price: number;
  pricePerSqft: number | null;
  sqft: number | null;
  dom: number | null;
  beds: number | null;
  baths: number | null;
  status: BoardPreviewStatus;
  photoCount: number | null;
  headline: string;
};

export const BOARD_PREVIEW_HREF = "/intelligence/board-preview/option-1";

export const BOARD_PREVIEW_TITLE = "Photo-led rows";

export const BOARD_PREVIEW_SUBTITLE =
  "Larger primary photo merged with address and key stats";
