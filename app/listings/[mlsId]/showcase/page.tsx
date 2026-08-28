import ListingShowcaseClient from "./ListingShowcaseClient";

export const dynamic = "force-dynamic";

/**
 * Alternate full-bleed listing layout — one photo spanning the viewport,
 * auto-rotating through the MLS set. Mockup only; `/listings/[mlsId]` stays
 * the production detail page.
 */
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
    title: `${label} — showcase mockup`,
    description: `Full-bleed rotating photo layout for listing #${mlsId}.`,
    robots: { index: false, follow: false },
  };
}

export default async function ListingShowcasePage({
  params,
  searchParams,
}: {
  params: Promise<{ mlsId: string }>;
  searchParams: Promise<{ address?: string; city?: string; panel?: string }>;
}) {
  const { mlsId } = await params;
  const { address, city, panel } = await searchParams;
  return (
    <ListingShowcaseClient
      mlsId={mlsId}
      addressHint={address?.trim() || null}
      townHint={city?.trim() || null}
      productionPanel={panel === "production"}
    />
  );
}
