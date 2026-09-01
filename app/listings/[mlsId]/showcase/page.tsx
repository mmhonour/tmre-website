import { permanentRedirect } from "next/navigation";
import { listingSectionHref } from "@/lib/listing-url";

export const dynamic = "force-dynamic";

/**
 * The showcase is now the listing page itself. This route stays so existing
 * links and bookmarks keep working, and folds them onto the canonical URL so
 * the same content is not served from two places.
 */
export default async function ListingShowcaseRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ mlsId: string }>;
  searchParams: Promise<{ address?: string; city?: string; panel?: string }>;
}) {
  const { mlsId } = await params;
  const { address, city, panel } = await searchParams;
  const extra = panel ? `panel=${encodeURIComponent(panel)}` : undefined;
  permanentRedirect(
    listingSectionHref(
      mlsId,
      "overview",
      address?.trim() || null,
      city?.trim() || null,
      extra,
    ),
  );
}
