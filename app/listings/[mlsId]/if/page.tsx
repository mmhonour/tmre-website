import ListingIfClient from "./ListingIfClient";

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
    title: `${label} — If — TMRE`,
    description: `If scenarios for ${label.trim()}.`,
  };
}

export default async function ListingIfPage({
  params,
  searchParams,
}: {
  params: Promise<{ mlsId: string }>;
  searchParams: Promise<{ address?: string; city?: string }>;
}) {
  const { mlsId } = await params;
  const { address, city } = await searchParams;
  return (
    <ListingIfClient
      mlsId={mlsId}
      addressHint={address?.trim() || null}
      townHint={city?.trim() || null}
    />
  );
}
