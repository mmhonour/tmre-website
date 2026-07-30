/**
 * Relative green → red coloring across a peer set of numeric stats.
 *
 * Ascending scale: lowest value = dark green, highest = red.
 * Descending scale: highest value = dark green, lowest = red.
 */

const DARK_GREEN = { r: 0x0d, g: 0x5c, b: 0x3d }
const RED = { r: 0xc8, g: 0x5a, b: 0x3a }

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

/** t=0 → dark green, t=1 → red. */
export function greenToRedColor(t: number): string {
  const x = clamp01(t)
  return `rgb(${lerpChannel(DARK_GREEN.r, RED.r, x)}, ${lerpChannel(DARK_GREEN.g, RED.g, x)}, ${lerpChannel(DARK_GREEN.b, RED.b, x)})`
}

export type StatScaleDirection = 'asc' | 'desc'

/**
 * Map `value` onto green→red given peer min/max.
 * Asc: min green, max red. Desc: max green, min red.
 */
export function relativeStatColor(
  value: number | null | undefined,
  peers: readonly (number | null | undefined)[],
  direction: StatScaleDirection,
): string | null {
  if (value == null || !Number.isFinite(value)) return null
  const nums = peers.filter(
    (n): n is number => n != null && Number.isFinite(n),
  )
  if (nums.length === 0) return null
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  if (min === max) return greenToRedColor(0.5)
  const ascT = (value - min) / (max - min)
  const t = direction === 'asc' ? ascT : 1 - ascT
  return greenToRedColor(t)
}

export function relativeStatColorStyle(
  value: number | null | undefined,
  peers: readonly (number | null | undefined)[],
  direction: StatScaleDirection,
): { color: string } | undefined {
  const color = relativeStatColor(value, peers, direction)
  return color ? { color } : undefined
}
