/**
 * Simplified Connecticut county outlines for Admin CT coverage thumbnails.
 * Approximate shapes for UI only — not survey-grade boundaries.
 *
 * viewBox: 0 0 240 140 (west→east, north→south)
 */

export const CT_COUNTY_MAP_VIEWBOX = '0 0 240 140'

/** Path `d` keyed by ct_counties.id — shared edges so fills meet cleanly. */
export const CT_COUNTY_MAP_PATHS: Record<string, string> = {
  // NW tall inland
  litchfield: 'M12,12 L78,12 L82,78 L76,128 L12,128 Z',
  // North-central
  hartford: 'M78,12 L148,12 L152,62 L142,78 L82,78 L78,12 Z',
  // NE of Hartford
  tolland: 'M148,12 L188,12 L192,52 L160,68 L152,62 L148,12 Z',
  // Far NE
  windham: 'M188,12 L228,12 L228,58 L196,72 L192,52 L188,12 Z',
  // SW coast (Long Island Sound)
  fairfield: 'M12,128 L76,128 L82,78 L70,88 L48,98 L12,102 Z',
  // South-central coast
  'new-haven':
    'M70,88 L82,78 L142,78 L152,62 L160,68 L156,92 L128,108 L96,112 L70,100 Z',
  // Coast east of New Haven
  middlesex:
    'M156,92 L160,68 L196,72 L200,96 L176,110 L156,104 Z',
  // SE coast
  'new-london':
    'M200,96 L196,72 L228,58 L228,118 L204,128 L176,118 L176,110 L200,96 Z',
}

export const CT_COUNTY_MAP_ORDER = [
  'litchfield',
  'hartford',
  'tolland',
  'windham',
  'fairfield',
  'new-haven',
  'middlesex',
  'new-london',
] as const
