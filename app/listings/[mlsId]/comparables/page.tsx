import ListingComparablesClient from "./ListingComparablesClient";

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
    title: `${label} — Comparables — TMRE`,
    description: `Comparable sold and active listings for ${label.trim()}.`,
  };
}

export default async function ListingComparablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ mlsId: string }>;
  searchParams: Promise<{ address?: string; city?: string }>;
}) {
  const { mlsId } = await params;
  const { address, city } = await searchParams;
  return (
    <ListingComparablesClient
      mlsId={mlsId}
      addressHint={address?.trim() || null}
      townHint={city?.trim() || null}
    />
  );
}
