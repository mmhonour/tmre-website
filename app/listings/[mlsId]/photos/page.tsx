import { Suspense } from "react";
import ListingPhotosClient from "./ListingPhotosClient";

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
  searchParams: Promise<{ address?: string; city?: string; photo?: string }>;
}) {
  const { mlsId } = await params;
  const { address, city } = await searchParams;
  return (
    <Suspense fallback={null}>
      <ListingPhotosClient
        mlsId={mlsId}
        addressHint={address?.trim() || null}
        townHint={city?.trim() || null}
      />
    </Suspense>
  );
}
