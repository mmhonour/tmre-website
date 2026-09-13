import { ListingShowcaseRoute } from "@/app/listings/[mlsId]/ListingShowcaseRoute";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ mlsId: string }>;
  searchParams: Promise<{ address?: string; city?: string; photo?: string }>;
}) {
  const { mlsId } = await params;
  const { address } = await searchParams;
  const label = address?.trim() || `Listing ${mlsId}`;
  return {
    title: `${label} — Photos — TMRE`,
    description: `All photos for ${label.trim()}.`,
  };
}

export default async function ListingPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ mlsId: string }>;
  searchParams: Promise<{
    address?: string;
    city?: string;
    photo?: string;
    panel?: string;
  }>;
}) {
  const { mlsId } = await params;
  const search = await searchParams;
  return (
    <ListingShowcaseRoute mlsId={mlsId} search={search} initialTab="photos" />
  );
}
