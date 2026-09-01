/**
 * Where a bar's percent sits relative to the fill it describes.
 *
 * Lives outside the bar component because the Monday email draws the same bars
 * in table cells and has to reach the same verdict. Two copies of this rule
 * would put the percent in one place on screen and another in the inbox.
 *
 * - `right` / `left`: on the track, just past the near edge of the fill.
 * - `outside-right`: past the track's right border.
 * - `label`: back beside the row's own label, the only room left of the track.
 */
export type BarAsidePlacement = 'right' | 'outside-right' | 'left' | 'label'

/**
 * Rough share of the track the percent needs. It is placed off the fill, which
 * is itself a percentage, so the reserve has to be one too.
 */
export const BAR_ASIDE_SPAN_PCT = 24

/**
 * A positive percent reads off the fill's right edge, and once the fill runs to
 * the end of the track it leaves the track entirely rather than climbing over
 * the value beside it. A negative one mirrors that to the left, where the row
 * label holds the only space outside the track.
 */
export function barAsidePlacement(
  leftPct: number,
  widthPct: number,
  negative: boolean,
): BarAsidePlacement {
  const fillLeft = Math.min(Math.max(leftPct, 0), 100)
  const fillRight = Math.min(Math.max(leftPct + widthPct, 0), 100)
  if (negative) {
    return fillLeft >= BAR_ASIDE_SPAN_PCT ? 'left' : 'label'
  }
  return 100 - fillRight >= BAR_ASIDE_SPAN_PCT ? 'right' : 'outside-right'
}
