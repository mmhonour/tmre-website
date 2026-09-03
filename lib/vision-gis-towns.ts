/** VGSI GIS host map — Westport first; add towns without redesigning the crawler. */

export type VisionGisTownConfig = {
  town: string
  /** Path segment under gis.vgsi.com, e.g. westportct */
  hostSlug: string
  /** Town GIS homepage (Streets.aspx / search). Not a Parcel.aspx?pid= Field Card. */
  baseUrl: string
  /**
   * VGSI printable Field Card PDF folder (no trailing slash).
   * Field Card PDF = `{fieldCardPdfBase}/{visionPid}.pdf`
   */
  fieldCardPdfBase: string
}

export const VISION_GIS_TOWNS: VisionGisTownConfig[] = [
  {
    town: 'Westport',
    hostSlug: 'westportct',
    baseUrl: 'https://gis.vgsi.com/westportct',
    fieldCardPdfBase: 'https://images.vgsi.com/cards/WestportCTCards',
  },
]

export function visionGisTownConfig(town: string): VisionGisTownConfig | null {
  const needle = town.trim().toLowerCase()
  return VISION_GIS_TOWNS.find((t) => t.town.toLowerCase() === needle) ?? null
}

/** VGSI GIS homepage for a town (host root, not a parcel Field Card). */
export function visionGisHomeUrl(town: string): string | null {
  return visionGisTownConfig(town)?.baseUrl ?? null
}

export const WESTPORT_VISION_GIS_HOME =
  visionGisHomeUrl('Westport') ?? 'https://gis.vgsi.com/westportct'

/** Native VGSI Field Card PDF — not Parcel.aspx HTML and not our JSON print view. */
export function visionGisFieldCardPdfUrl(
  town: string,
  visionPid: string,
): string | null {
  const cfg = visionGisTownConfig(town)
  const pid = visionPid.trim()
  if (!cfg || !pid) return null
  return `${cfg.fieldCardPdfBase.replace(/\/+$/, '')}/${encodeURIComponent(pid)}.pdf`
}

export const VISION_GIS_STREET_LETTERS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((c) => c !== 'X' && c !== 'Z')

/** Letters the street index should have, minus those already stored. */
export function missingVisionStreetLetters(
  have: readonly string[],
): string[] {
  const seen = new Set(
    have.map((letter) => letter.trim().toUpperCase()).filter(Boolean),
  )
  return VISION_GIS_STREET_LETTERS.filter((letter) => !seen.has(letter))
}
