import { redirect } from "next/navigation";
import { LISTING_SALE_ON_MARKET_PANEL_ID } from "@/components/listing/listing-section-ids";
import { spotlightSectionHref } from "@/lib/spotlight-url";

export const metadata = {
  title: "Spotlight Comparables — TMRE",
  description: "Redirects to Sold for-sale on-market comps for the Spotlight property.",
};

/** Legacy route — On The Market group removed; jump to Sold's for-sale on-market panel. */
export default async function SpotlightOnTheMarketRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value) && value[0]) qs.set(key, value[0]);
  }
  const base = spotlightSectionHref("comparables");
  const query = qs.toString();
  redirect(
    `${base}${query ? `?${query}` : ""}#${LISTING_SALE_ON_MARKET_PANEL_ID}`,
  );
}
