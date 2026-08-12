/** VGSI GIS host map — Westport first; add towns without redesigning the crawler. */

export type VisionGisTownConfig = {
  town: string
  /** Path segment under gis.vgsi.com, e.g. westportct */
  hostSlug: string
  baseUrl: string
}

export const VISION_GIS_TOWNS: VisionGisTownConfig[] = [
  {
    town: 'Westport',
    hostSlug: 'westportct',
    baseUrl: 'https://gis.vgsi.com/westportct',
  },
]

export function visionGisTownConfig(town: string): VisionGisTownConfig | null {
  const needle = town.trim().toLowerCase()
  return VISION_GIS_TOWNS.find((t) => t.town.toLowerCase() === needle) ?? null
}

export const VISION_GIS_STREET_LETTERS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((c) => c !== 'X' && c !== 'Z')
