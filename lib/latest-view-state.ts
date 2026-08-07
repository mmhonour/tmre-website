import { isTmreTown } from "@/lib/tmre-towns";

/** Session-only: restore /latest view after listing Back (or soft remount). */
export const LATEST_VIEW_STORAGE_KEY = "tmre_latest_view";

const LATEST_STATUSES = [
  "Coming Soon",
  "New",
  "Back on Market",
  "Reduced",
  "Increased",
] as const;

export type LatestStatus = (typeof LATEST_STATUSES)[number];

export type LatestViewState = {
  groupByTown: boolean;
  groupByZip: boolean;
  selectedTown: string | null;
  townStatsOpen: boolean;
  collapsedGroups: string[];
  expandedGroups: string[];
  groupStatusFilter: Partial<Record<string, LatestStatus>>;
  scrollY: number;
};

function isLatestStatus(value: unknown): value is LatestStatus {
  return (
    typeof value === "string" &&
    (LATEST_STATUSES as readonly string[]).includes(value)
  );
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function readLatestViewState(): LatestViewState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LATEST_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LatestViewState>;
    const selectedTown =
      typeof parsed.selectedTown === "string" && isTmreTown(parsed.selectedTown)
        ? parsed.selectedTown
        : null;
    const groupStatusFilter: Partial<Record<string, LatestStatus>> = {};
    if (parsed.groupStatusFilter && typeof parsed.groupStatusFilter === "object") {
      for (const [label, status] of Object.entries(parsed.groupStatusFilter)) {
        if (label && isLatestStatus(status)) groupStatusFilter[label] = status;
      }
    }
    const groupByTown = Boolean(parsed.groupByTown);
    return {
      groupByTown,
      groupByZip: groupByTown && Boolean(parsed.groupByZip),
      selectedTown,
      townStatsOpen: Boolean(parsed.townStatsOpen),
      collapsedGroups: asStringArray(parsed.collapsedGroups),
      expandedGroups: asStringArray(parsed.expandedGroups),
      groupStatusFilter,
      scrollY:
        typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
          ? Math.max(0, parsed.scrollY)
          : 0,
    };
  } catch {
    return null;
  }
}

export function writeLatestViewState(state: LatestViewState): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LATEST_VIEW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota */
  }
}

export function patchLatestViewScrollY(scrollY: number): void {
  const current = readLatestViewState();
  if (!current) {
    writeLatestViewState({
      groupByTown: false,
      groupByZip: false,
      selectedTown: null,
      townStatsOpen: false,
      collapsedGroups: [],
      expandedGroups: [],
      groupStatusFilter: {},
      scrollY: Math.max(0, scrollY),
    });
    return;
  }
  writeLatestViewState({ ...current, scrollY: Math.max(0, scrollY) });
}
