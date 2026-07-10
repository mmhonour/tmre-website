function ordinalSuffix(day: number): string {
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  switch (day % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

/** e.g. "Thu 9th of July Norwalk" — weekday, ordinal day, month, optional town. */
export function formatDealOfTheDayHeaderSubtitle(
  date: Date,
  town: string | null | undefined,
): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })
  const day = date.getDate()
  const month = date.toLocaleDateString('en-US', { month: 'long' })
  const datePart = `${weekday} ${day}${ordinalSuffix(day)} of ${month}`
  const trimmedTown = town?.trim()
  return trimmedTown ? `${datePart} ${trimmedTown}` : datePart
}
