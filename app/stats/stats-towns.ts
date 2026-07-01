import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

export const STATS_KINDS = ['sale', 'rental'] as const
export type StatsKind = (typeof STATS_KINDS)[number]

export const TOWN_LIST = TMRE_TOWNS

export const STATS_CITIES = ['All', ...TOWN_LIST] as const

export type Town = TmreTown
export type StatsCity = (typeof STATS_CITIES)[number]
