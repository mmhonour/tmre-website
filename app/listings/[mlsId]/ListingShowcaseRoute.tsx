import type { ListingTab } from "@/components/listing/ListingSubnav";
import ListingShowcaseClient from "@/app/listings/[mlsId]/showcase/ListingShowcaseClient";

export type ListingShowcaseSearch = {
  address?: string;
  city?: string;
  panel?: string;
  photo?: string;
};

function parsePhotoIndex(raw?: string): number {
  if (raw == null || raw === "") return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Canonical listing chrome — showcase, optionally opened on a panel. */
export function ListingShowcaseRoute({
  mlsId,
  search,
  initialTab = null,
}: {
  mlsId: string;
  search: ListingShowcaseSearch;
  initialTab?: ListingTab | null;
}) {
  return (
    <ListingShowcaseClient
      mlsId={mlsId}
      addressHint={search.address?.trim() || null}
      townHint={search.city?.trim() || null}
      productionPanel={search.panel === "production"}
      initialTab={initialTab}
      initialPhotoIndex={parsePhotoIndex(search.photo)}
    />
  );
}
