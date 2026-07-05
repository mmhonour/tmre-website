import { formatTownZipPlace } from "@/lib/tmre-towns";

export type SnapshotListingsStatus = "new" | "reduced" | "closed";

export function intelligenceListingsHref(options: {
  city: string;
  status: SnapshotListingsStatus;
  zip?: string | null;
  tx?: string;
  cls?: string;
  saleProperty?: string;
}): string {
  const params = new URLSearchParams({
    city: options.city,
    status: options.status,
  });
  if (options.zip) params.set("zip", options.zip);
  if (options.tx && options.tx !== "all") params.set("tx", options.tx);
  if (options.cls && options.cls !== "all") params.set("cls", options.cls);
  if (options.saleProperty && options.saleProperty !== "all") {
    params.set("property", options.saleProperty);
  }
  return `/intelligence/listings?${params.toString()}`;
}

export function snapshotListingsTitle(
  status: SnapshotListingsStatus,
  city: string,
  zip?: string | null,
  tx?: string,
): string {
  const place = formatTownZipPlace(city, zip);
  if (status === "new") return `New listings this week · ${place}`;
  if (status === "reduced") return `Price-reduced listings · ${place}`;
  return tx === "rental"
    ? `Leased this week · ${place}`
    : `Closed this week · ${place}`;
}
