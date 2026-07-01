export function statsMedianListingsHref(options: {
  city: string;
  kind?: "sale" | "rental";
  /** Active listings (Intelligence snapshot) vs closed sales (default stats). */
  pool?: "active" | "closed";
  zip?: string | null;
  tx?: string;
  cls?: string;
  saleProperty?: string;
}): string {
  const params = new URLSearchParams({
    city: options.city,
    view: "median",
  });
  if (options.kind) params.set("kind", options.kind);
  if (options.pool === "active") params.set("pool", "active");
  if (options.zip) params.set("zip", options.zip);
  if (options.tx && options.tx !== "all") params.set("tx", options.tx);
  if (options.cls && options.cls !== "all") params.set("cls", options.cls);
  if (options.saleProperty && options.saleProperty !== "all") {
    params.set("property", options.saleProperty);
  }
  return `/stats?${params.toString()}#median-price-listings`;
}
