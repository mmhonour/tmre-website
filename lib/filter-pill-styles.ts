export type FilterPillSize = "default" | "compact";
export type FilterPillTheme = "dark" | "light";

const SIZES: Record<
  FilterPillSize,
  { button: string; container: string; separator: string }
> = {
  default: {
    button: "px-4 py-2.5 text-sm shrink-0",
    container: "gap-1 p-1",
    separator: "h-5 mx-0.5",
  },
  compact: {
    button: "px-3 py-1 text-xs shrink-0",
    container: "gap-0.5 p-0.5",
    separator: "h-4 mx-0.5",
  },
};

export function filterPillButtonClass(
  active: boolean,
  size: FilterPillSize = "default",
  theme: FilterPillTheme = "dark",
): string {
  const { button } = SIZES[size];
  const inactive =
    theme === "light"
      ? "text-navy/65 hover:text-navy"
      : "text-white/70 hover:text-white";
  return `${button} rounded-full font-medium whitespace-nowrap transition-all cursor-pointer ${
    active
      ? "bg-gold text-navy shadow-lg shadow-gold/20"
      : inactive
  }`;
}

/** Per-pill border (Intelligence town/zip filters, Latest status pills). */
export function filterPillIndependentButtonClass(
  active: boolean,
  size: FilterPillSize = "default",
  theme: FilterPillTheme = "dark",
): string {
  const base = filterPillButtonClass(active, size, theme);
  const border =
    theme === "light"
      ? active
        ? "border border-gold shadow-md shadow-gold/20"
        : "border border-charcoal/15 hover:border-charcoal/30"
      : active
        ? "border border-gold shadow-md shadow-gold/20"
        : "border border-white/20 hover:border-white/50";
  return `${base} ${border}`;
}

export function filterPillIndependentContainerClass(
  size: FilterPillSize = "default",
): string {
  const gap = size === "compact" ? "gap-1" : "gap-1.5";
  return `flex flex-wrap items-center ${gap} w-full min-w-0`;
}

/** Intelligence zip/town hero pills — separate bordered buttons matching zip filter row. */
export function filterPillZipButtonClass(
  active: boolean,
  isAllPill: boolean,
): string {
  const base =
    "font-mono text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 rounded-full border transition-all cursor-pointer";
  if (active) {
    return isAllPill
      ? `${base} bg-white text-navy border-white shadow-md`
      : `${base} bg-gold text-navy border-gold shadow-md shadow-gold/20`;
  }
  return `${base} border-white/20 text-white/55 hover:border-white/50 hover:text-white`;
}

export function filterPillZipContainerClass(): string {
  return "flex flex-wrap gap-1 self-start w-full min-w-0";
}

/** Intelligence town filter hyperlinks (promoted layout — unselected towns / All). */
export function filterPillZipLinkClass(active: boolean): string {
  const base =
    "font-mono text-[10px] tracking-[0.15em] uppercase transition-colors shrink-0 cursor-pointer";
  return active
    ? `${base} text-gold hover:text-gold-light`
    : `${base} text-white/55 hover:text-gold`;
}

/** Underline decoration for link label text only (not property counts). */
export function filterPillZipLinkUnderlineClass(active: boolean): string {
  return active
    ? "underline underline-offset-[3px] decoration-gold/50"
    : "underline underline-offset-[3px] decoration-white/20 hover:decoration-gold/50";
}

export function filterPillPromotedContainerClass(inline = false): string {
  return inline
    ? "flex flex-wrap items-center gap-x-3 gap-y-1 self-start min-w-0"
    : "flex flex-wrap items-center gap-x-3 gap-y-1 self-start w-full min-w-0";
}

export function filterPillPromotedLinksClass(): string {
  return "flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0";
}

export function filterPillContainerClass(
  size: FilterPillSize = "default",
  options?: { wrap?: boolean; bordered?: boolean; theme?: FilterPillTheme },
): string {
  const theme = options?.theme ?? "dark";
  const { container } = SIZES[size];
  const layout =
    options?.wrap === false
      ? "inline-flex items-center"
      : "inline-flex flex-wrap items-center";
  const border =
    options?.bordered === false
      ? null
      : theme === "light"
        ? "border border-charcoal/[0.08]"
        : "border border-white/10";
  const surface = theme === "light" ? "bg-white" : "bg-white/5";
  return [layout, "rounded-full", surface, border, container]
    .filter(Boolean)
    .join(" ");
}

export function filterPillSeparatorClass(
  size: FilterPillSize = "default",
  theme: FilterPillTheme = "dark",
): string {
  const tone = theme === "light" ? "bg-charcoal/15" : "bg-white/15";
  return `w-px shrink-0 ${tone} ${SIZES[size].separator}`;
}
