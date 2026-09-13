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
    title: `${label} — TMRE`,
    description: address?.trim()
      ? `Photos and full details for ${address.trim()}.`
      : `Photos and full details for listing #${mlsId}.`,
  };
}

/**
 * The listing page is the showcase: a full-bleed rotating photo over a
 * continuous details panel. `?panel=production` swaps the panel for the
 * previous `ListingDetailClient` layout, which is kept as a comparison and
 * fallback surface.
 */
export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ mlsId: string }>;
  searchParams: Promise<{
    address?: string;
    city?: string;
    panel?: string;
    photo?: string;
  }>;
}) {
  const { mlsId } = await params;
  const search = await searchParams;
  return <ListingShowcaseRoute mlsId={mlsId} search={search} />;
}
