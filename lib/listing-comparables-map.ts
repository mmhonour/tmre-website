/**
 * Shared URL + layer helpers for the showcase comps map.
 * Filtering stays in `listing-comparables-session` / the comps panel — this
 * file only decides which market layers to plot and which API to load.
 */

export type ComparablesKind = "sale" | "rental";

export type CompsMapLayer = "active-sale" | "active-rental" | "closed";

export type CompsMapLayerSpec = {
  id: CompsMapLayer;
  label: string;
};

export function listingComparablesApiUrl(
  mlsId: string,
  kind: ComparablesKind,
  override?: string | null,
): string {
  if (override) return override;
  const base = `/api/listings/${encodeURIComponent(mlsId)}/comparables`;
  return kind === "rental" ? `${base}?kind=rental` : base;
}

/**
 * Compact overlay: subject's market only.
 * Roomy (expanded / details / full-screen): both on-market layers.
 */
export function compsMapLayers(opts: {
  subjectKind: ComparablesKind;
  roomy: boolean;
}): CompsMapLayerSpec[] {
  const showRentals = opts.subjectKind === "rental" || opts.roomy;
  const showSales = opts.subjectKind === "sale" || opts.roomy;
  const layers: CompsMapLayerSpec[] = [];
  if (opts.subjectKind === "rental") {
    if (showRentals) layers.push({ id: "active-rental", label: "For rent" });
    if (showSales) layers.push({ id: "active-sale", label: "For sale" });
    layers.push({ id: "closed", label: "Rented" });
  } else {
    if (showSales) layers.push({ id: "active-sale", label: "For sale" });
    if (showRentals) layers.push({ id: "active-rental", label: "For rent" });
    layers.push({ id: "closed", label: "Closed" });
  }
  return layers;
}

export function defaultCompsMapLayer(
  subjectKind: ComparablesKind,
): CompsMapLayer {
  return subjectKind === "rental" ? "active-rental" : "active-sale";
}

/** Resolve sale + rental fetch URLs from optional host overrides. */
export function resolveCompsMapFetchUrls(
  mlsId: string,
  opts?: {
    fetchUrl?: string | null;
    rentalFetchUrl?: string | null;
    subjectKind?: ComparablesKind;
  },
): { sale: string; rental: string } {
  const kind = opts?.subjectKind ?? "sale";
  const saleOverride = kind === "rental" ? null : (opts?.fetchUrl ?? null);
  const rentalOverride =
    opts?.rentalFetchUrl ?? (kind === "rental" ? (opts?.fetchUrl ?? null) : null);
  return {
    sale: listingComparablesApiUrl(mlsId, "sale", saleOverride),
    rental: listingComparablesApiUrl(mlsId, "rental", rentalOverride),
  };
}
