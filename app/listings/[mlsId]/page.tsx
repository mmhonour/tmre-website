import ListingDetailClient from "./ListingDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mlsId: string }>;
}) {
  const { mlsId } = await params;
  return {
    title: `Listing ${mlsId} — TMRE`,
    description: `Photos and full details for MLS #${mlsId}.`,
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ mlsId: string }>;
}) {
  const { mlsId } = await params;
  return <ListingDetailClient mlsId={mlsId} />;
}
