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
  return `${button} rounded-full font-medium whitespace-nowrap transition-all ${
    active
      ? "bg-gold text-navy shadow-lg shadow-gold/20"
      : inactive
  }`;
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
