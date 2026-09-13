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
    title: `${label} — Comparable Rentals — TMRE`,
    description: `Comparable leased and active rentals for ${label.trim()}.`,
  };
}

export default async function ListingComparableRentalsPage({
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
      initialTab="comparable-rentals"
    />
  );
}
