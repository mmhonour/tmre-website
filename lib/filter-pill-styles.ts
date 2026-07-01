export type FilterPillSize = "default" | "compact";

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
): string {
  const { button } = SIZES[size];
  return `${button} rounded-full font-medium whitespace-nowrap transition-all ${
    active
      ? "bg-gold text-navy shadow-lg shadow-gold/20"
      : "text-white/70 hover:text-white"
  }`;
}

export function filterPillContainerClass(
  size: FilterPillSize = "default",
  options?: { wrap?: boolean; bordered?: boolean },
): string {
  const { container } = SIZES[size];
  const layout =
    options?.wrap === false
      ? "inline-flex items-center"
      : "inline-flex flex-wrap items-center";
  const border =
    options?.bordered === false ? null : "border border-white/10";
  return [layout, "rounded-full", "bg-white/5", border, container]
    .filter(Boolean)
    .join(" ");
}

export function filterPillSeparatorClass(size: FilterPillSize = "default"): string {
  return `w-px bg-white/15 shrink-0 ${SIZES[size].separator}`;
}
