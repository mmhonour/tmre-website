/** Milliseconds until the next Monday 02:00 America/New_York (EST/EDT). */
export function msUntilNextMonday2amEt(from = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(from)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  const y = Number(get('year'))
  const m = Number(get('month'))
  const d = Number(get('day'))
  const weekday = get('weekday')
  const hour = Number(get('hour') === '24' ? '0' : get('hour'))
  const minute = Number(get('minute'))
  const second = Number(get('second'))

  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const dayOfWeek = weekdayIndex[weekday] ?? 0
  const etAsUtc = Date.UTC(y, m - 1, d, hour, minute, second)

  let daysUntilMonday = (8 - dayOfWeek) % 7
  if (dayOfWeek === 1) {
    const monday2am = Date.UTC(y, m - 1, d, 2, 0, 0)
    if (etAsUtc < monday2am) {
      return Math.max(60_000, monday2am - etAsUtc)
    }
    daysUntilMonday = 7
  } else if (daysUntilMonday === 0) {
    daysUntilMonday = 7
  }

  const targetDate = new Date(Date.UTC(y, m - 1, d + daysUntilMonday, 2, 0, 0))
  const targetAsUtc = Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate(),
    2,
    0,
    0,
  )

  return Math.max(60_000, targetAsUtc - etAsUtc)
}

export function nextMonday2amEt(from = new Date()): Date {
  return new Date(from.getTime() + msUntilNextMonday2amEt(from))
}
