import { ListingShowcaseRoute } from "@/app/listings/[mlsId]/ListingShowcaseRoute";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ mlsId: string }>;
  searchParams: Promise<{ address?: string; city?: string }>;
}) {
  const { mlsId } = await params;
  const { address } = await searchParams;
  const label = address?.trim() || `Listing ${mlsId}`;
  return {
    title: `${label} — On the market — TMRE`,
    description: `On-the-market comparables for ${label.trim()}.`,
  };
}

/** Legacy route — On The Market group removed; open the showcase comps panel. */
export default async function ListingOnTheMarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ mlsId: string }>;
  searchParams: Promise<{ address?: string; city?: string; panel?: string }>;
}) {
  const { mlsId } = await params;
  const search = await searchParams;
  return (
    <ListingShowcaseRoute
      mlsId={mlsId}
      search={search}
      initialTab="comparables"
    />
  );
}
