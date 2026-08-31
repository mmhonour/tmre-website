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

/** Deep link to Stats → Months supply chart for a town (or All). */
export function statsMonthsSupplyHref(options: {
  city: string;
  kind?: "sale" | "rental";
}): string {
  const params = new URLSearchParams({
    city: options.city,
    kind: options.kind ?? "sale",
    chart: "months-supply",
  });
  return `/stats?${params.toString()}`;
}

/** Deep link to Stats → closed sales by month for a town (or All). */
export function statsSalesTrendHref(options: {
  city: string;
  kind?: "sale" | "rental";
}): string {
  const params = new URLSearchParams({
    city: options.city,
    kind: options.kind ?? "sale",
    chart: "sales-trend",
  });
  return `/stats?${params.toString()}`;
}

/** Deep link to Stats → active listings by month for a town (or All). */
export function statsActiveByMonthHref(options: {
  city: string;
  kind?: "sale" | "rental";
}): string {
  const params = new URLSearchParams({
    city: options.city,
    kind: options.kind ?? "sale",
    chart: "active-by-month",
  });
  return `/stats?${params.toString()}`;
}

/** Deep link to Stats → median closed price by town. */
export function statsMedianByTownHref(options: {
  city: string;
  kind?: "sale" | "rental";
}): string {
  const params = new URLSearchParams({
    city: options.city,
    kind: options.kind ?? "sale",
    chart: "median-by-town",
  });
  return `/stats?${params.toString()}`;
}

/** Deep link to Stats → list-to-ask chart for a town (or All). */
export function statsListToAskHref(options: {
  city: string;
  kind?: "sale" | "rental";
}): string {
  const params = new URLSearchParams({
    city: options.city,
    kind: options.kind ?? "sale",
    chart: "list-to-ask",
  });
  return `/stats?${params.toString()}`;
}

/** Deep link to Stats → avg days on market chart for a town (or All). */
export function statsAvgDomHref(options: {
  city: string;
  kind?: "sale" | "rental";
}): string {
  const params = new URLSearchParams({
    city: options.city,
    kind: options.kind ?? "sale",
    chart: "avg-dom",
  });
  return `/stats?${params.toString()}`;
}
