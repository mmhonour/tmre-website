import { redirect } from "next/navigation";
import { LISTING_SALE_ON_MARKET_PANEL_ID } from "@/components/listing/listing-section-ids";
import { listingSectionHref } from "@/lib/listing-url";

export const dynamic = "force-dynamic";

/** Legacy route — On The Market group removed; jump to Sold's for-sale on-market panel. */
export default async function ListingOnTheMarketRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ mlsId: string }>;
  searchParams: Promise<{ address?: string; city?: string }>;
}) {
  const { mlsId } = await params;
  const { address, city } = await searchParams;
  const base = listingSectionHref(
    mlsId,
    "comparables",
    address?.trim() || null,
    city?.trim() || null,
  );
  redirect(`${base}#${LISTING_SALE_ON_MARKET_PANEL_ID}`);
}
