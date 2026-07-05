import type { TmreTown } from '@/lib/tmre-towns'

export type GeoPoint = { lat: number; lon: number }

/** Downtown / village center for each TMRE town. */
export const TOWN_CENTERS: Record<TmreTown, GeoPoint> = {
  Norwalk: { lat: 41.1177, lon: -73.4082 },
  Westport: { lat: 41.1415, lon: -73.3579 },
  Wilton: { lat: 41.1951, lon: -73.4368 },
  Fairfield: { lat: 41.1408, lon: -73.2637 },
  Weston: { lat: 41.2001, lon: -73.3835 },
  'New Canaan': { lat: 41.1468, lon: -73.495 },
  Ridgefield: { lat: 41.2815, lon: -73.4982 },
}

/** Zip-level centers for premium sub-markets within a town. */
export const ZIP_CENTERS: Readonly<Record<string, GeoPoint>> = {
  '06850': { lat: 41.128, lon: -73.432 },
  '06851': { lat: 41.118, lon: -73.401 },
  '06852': { lat: 41.105, lon: -73.415 },
  '06853': { lat: 41.037, lon: -73.385 },
  '06854': { lat: 41.093, lon: -73.418 },
  '06855': { lat: 41.152, lon: -73.388 },
  '06856': { lat: 41.138, lon: -73.445 },
  '06840': { lat: 41.147, lon: -73.495 },
  '06880': { lat: 41.141, lon: -73.358 },
  '06881': { lat: 41.175, lon: -73.321 },
  '06838': { lat: 41.118, lon: -73.315 },
  '06897': { lat: 41.195, lon: -73.437 },
  '06883': { lat: 41.2, lon: -73.383 },
  '06824': { lat: 41.141, lon: -73.264 },
  '06825': { lat: 41.178, lon: -73.243 },
  '06828': { lat: 41.165, lon: -73.285 },
  '06890': { lat: 41.128, lon: -73.283 },
  '06877': { lat: 41.282, lon: -73.498 },
  '06879': { lat: 41.245, lon: -73.445 },
}

/**
 * Representative shoreline, harbor, and beach access points on Long Island Sound
 * and inland premium water (Norwalk River, Saugatuck).
 */
export const WATER_ACCESS_POINTS: readonly GeoPoint[] = [
  // Norwalk / Rowayton
  { lat: 41.034, lon: -73.378 },
  { lat: 41.045, lon: -73.392 },
  { lat: 41.088, lon: -73.412 },
  { lat: 41.102, lon: -73.405 },
  // Westport
  { lat: 41.108, lon: -73.345 },
  { lat: 41.118, lon: -73.332 },
  { lat: 41.125, lon: -73.328 },
  // Fairfield / Southport
  { lat: 41.128, lon: -73.283 },
  { lat: 41.135, lon: -73.275 },
  { lat: 41.148, lon: -73.255 },
  { lat: 41.165, lon: -73.248 },
  // Darien-adjacent sound front (06820 context for Greens Farms)
  { lat: 41.055, lon: -73.318 },
]

export type GolfAmenity = GeoPoint & {
  name: string
  kind: 'public' | 'private' | 'country_club'
}

/** Public courses, private clubs, and country clubs across TMRE coverage. */
export const GOLF_AMENITIES: readonly GolfAmenity[] = [
  { name: 'Shorehaven Golf Club', lat: 41.102, lon: -73.401, kind: 'private' },
  { name: 'Silvermine Golf Club', lat: 41.145, lon: -73.453, kind: 'private' },
  { name: 'Oak Hills Park Golf Course', lat: 41.128, lon: -73.428, kind: 'public' },
  { name: 'Longshore Club Park', lat: 41.118, lon: -73.348, kind: 'public' },
  { name: 'Country Club of Fairfield', lat: 41.168, lon: -73.278, kind: 'country_club' },
  { name: 'H. Smith Richardson Golf Course', lat: 41.178, lon: -73.255, kind: 'public' },
  { name: 'Aspetuck Valley Country Club', lat: 41.168, lon: -73.348, kind: 'country_club' },
  { name: 'Birchwood Country Club', lat: 41.155, lon: -73.335, kind: 'country_club' },
  { name: 'Wilton Riding Club', lat: 41.188, lon: -73.425, kind: 'private' },
  { name: 'Wilton Country Club', lat: 41.192, lon: -73.418, kind: 'country_club' },
  { name: 'New Canaan Country Club', lat: 41.138, lon: -73.478, kind: 'country_club' },
  { name: 'Waveny Golf Course', lat: 41.132, lon: -73.492, kind: 'public' },
  { name: 'Ridgefield Golf Course', lat: 41.268, lon: -73.478, kind: 'public' },
  { name: 'Silver Spring Country Club', lat: 41.305, lon: -73.478, kind: 'country_club' },
  { name: 'Woodway Country Club', lat: 41.078, lon: -73.368, kind: 'country_club' },
  { name: 'Weir Farm Golf Club', lat: 41.248, lon: -73.455, kind: 'private' },
]
