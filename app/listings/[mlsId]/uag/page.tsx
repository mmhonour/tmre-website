import ListingComparablesClient from "../comparables/ListingComparablesClient";

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
    title: `${label} — Under Agreement — TMRE`,
    description: `Under-contract comparable listings for ${label.trim()}.`,
  };
}

export default async function ListingUagPage({
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
      mode="uag"
    />
  );
}
