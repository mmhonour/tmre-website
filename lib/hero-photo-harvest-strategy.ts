/** Configure harvest order for the Railway R2 photo scavenger (`hero-photos`). */

export const HERO_PHOTO_HARVEST_STRATEGIES = [
  {
    id: 'newest',
    label: 'Newest listings',
    hint: 'Active first, newest list_date. Live Media URLs; stays off old Closed the laptop CLI covers.',
  },
  {
    id: 'oldest',
    label: 'Oldest listings',
    hint: 'Active first, oldest list_date. Legacy walk — can stall on dead extra slots.',
  },
  {
    id: 'closed-oldest',
    label: 'Oldest Closed',
    hint: 'Closed/Expired first, oldest list_date. Use when a new town has no laptop backfill yet.',
  },
  {
    id: 'almost-full',
    label: 'Almost complete',
    hint: 'Holes closest to a full gallery first so leftover % can actually drop.',
  },
] as const

export type HeroPhotoHarvestId = (typeof HERO_PHOTO_HARVEST_STRATEGIES)[number]['id']

export const DEFAULT_HERO_PHOTO_HARVEST: HeroPhotoHarvestId = 'newest'

const HARVEST_IDS = new Set<string>(
  HERO_PHOTO_HARVEST_STRATEGIES.map((row) => row.id),
)

export function isHeroPhotoHarvestId(value: unknown): value is HeroPhotoHarvestId {
  return typeof value === 'string' && HARVEST_IDS.has(value)
}

export function parseHeroPhotoHarvest(value: unknown): HeroPhotoHarvestId {
  return isHeroPhotoHarvestId(value) ? value : DEFAULT_HERO_PHOTO_HARVEST
}

export function resolveHeroPhotoHarvest(
  job: { harvest?: unknown } | null | undefined,
): HeroPhotoHarvestId {
  return parseHeroPhotoHarvest(job?.harvest)
}

export function heroPhotoHarvestLabel(id: HeroPhotoHarvestId): string {
  return HERO_PHOTO_HARVEST_STRATEGIES.find((row) => row.id === id)?.label ?? id
}
