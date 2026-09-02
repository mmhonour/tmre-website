/**
 * Open houses table smoke (CLI).
 *
 * Safe against a live database: writes only into a far-future window
 * (2099-01-01..07) and clears it before exit.
 *
 *   npm run smoke:open-houses
 */

import {
  ensureOpenHousesTable,
  pruneOpenHousesBefore,
  readOpenHouseCountsForListings,
  readOpenHouseStats,
  readOpenHousesInWindow,
  replaceOpenHouseWindow,
  upsertOpenHouses,
} from '../lib/db/open-houses-repo'
import { query } from '../lib/db/postgres'

const WINDOW = { start: '2099-01-01', end: '2099-01-07' }

const EVENTS = [
  {
    id: 'smoke-oh-1',
    listingKey: 'KEY-SMOKE-1',
    listingId: 'MLS-SMOKE-1',
    date: '2099-01-02',
    startDateTime: '2099-01-02T11:00:00',
    endDateTime: '2099-01-02T13:00:00',
    type: 'O',
    comment: 'smoke',
  },
  {
    id: 'smoke-oh-2',
    listingKey: 'KEY-SMOKE-2',
    listingId: 'MLS-SMOKE-2',
    date: '2099-01-03',
    startDateTime: '2099-01-03T14:00:00',
    endDateTime: '2099-01-03T16:00:00',
    type: 'O',
    comment: null,
  },
]

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}

async function main() {
  console.log('open houses smoke')
  await ensureOpenHousesTable()
  console.log('PASS  open_houses exists')

  const first = await replaceOpenHouseWindow(WINDOW, EVENTS)
  assert(first.written === 2, `expected written 2, got ${first.written}`)
  const read1 = await readOpenHousesInWindow(WINDOW)
  assert(read1.length === 2, `expected 2 rows, got ${read1.length}`)
  assert(read1[0]?.id === 'smoke-oh-1', `order/id mismatch: ${read1[0]?.id}`)
  assert(read1[0]?.date === '2099-01-02', `date mismatch: ${read1[0]?.date}`)
  console.log('PASS  window replace writes both events')

  const second = await replaceOpenHouseWindow(WINDOW, [EVENTS[0]])
  assert(second.written === 1, `expected written 1, got ${second.written}`)
  const read2 = await readOpenHousesInWindow(WINDOW)
  assert(
    read2.length === 1 && read2[0]?.id === 'smoke-oh-1',
    'cancelled event stayed after window replace',
  )
  console.log('PASS  cancelled event disappears on replace')

  const empty = await replaceOpenHouseWindow(WINDOW, [])
  assert(empty.written === 0, 'empty replace should write 0')
  const read3 = await readOpenHousesInWindow(WINDOW)
  assert(read3.length === 0, 'successful empty pull should clear the window')
  console.log('PASS  successful empty pull clears the window')

  await replaceOpenHouseWindow(WINDOW, EVENTS)
  const history = await upsertOpenHouses([
    {
      id: 'smoke-oh-past',
      listingKey: 'KEY-SMOKE-1',
      listingId: 'MLS-SMOKE-1',
      date: '2098-12-15',
      startDateTime: '2098-12-15T11:00:00',
      endDateTime: '2098-12-15T13:00:00',
      type: 'O',
      comment: 'past',
    },
  ])
  assert(history === 1, `expected 1 history upsert, got ${history}`)
  const afterUpcomingReplace = await replaceOpenHouseWindow(WINDOW, [EVENTS[0]])
  assert(afterUpcomingReplace.written === 1, 'upcoming replace should write 1')
  const stillThere = await readOpenHousesInWindow({
    start: '2098-12-01',
    end: '2098-12-31',
  })
  assert(
    stillThere.some((row) => row.id === 'smoke-oh-past'),
    'lookback upsert must survive an upcoming-window replace',
  )
  console.log('PASS  history upsert survives upcoming replace')

  const counts = await readOpenHouseCountsForListings(
    [{ mlsId: 'MLS-SMOKE-1', listingKey: 'KEY-SMOKE-1' }],
    '2099-01-01',
  )
  const smoke = counts.get('MLS-SMOKE-1')
  assert(smoke, 'expected counts for MLS-SMOKE-1')
  assert(smoke.past === 1, `expected 1 past, got ${smoke.past}`)
  assert(smoke.upcoming === 1, `expected 1 upcoming, got ${smoke.upcoming}`)
  console.log('PASS  past / upcoming counts')

  const pruned = await pruneOpenHousesBefore('2098-12-20')
  assert(pruned >= 1, 'expected prune of the aged-out history row')
  console.log('PASS  prune drops dates before the lookback horizon')

  const joinRows = await query<{ oh_id: string }>(
    `SELECT oh.id AS oh_id
       FROM open_houses oh
       LEFT JOIN listings l
         ON (oh.listing_id IS NOT NULL AND oh.listing_id = l.mls_id)
         OR (oh.listing_key IS NOT NULL AND oh.listing_key = l.listing_key)
      WHERE oh.oh_date BETWEEN $1::date AND $2::date`,
    [WINDOW.start, WINDOW.end],
  )
  assert(joinRows.length === 1, `join probe expected 1, got ${joinRows.length}`)
  console.log('PASS  listings join shape parses')

  await replaceOpenHouseWindow(WINDOW, [])
  await replaceOpenHouseWindow({ start: '2098-12-01', end: '2098-12-31' }, [])
  const stats = await readOpenHouseStats()
  console.log(`PASS  cleanup · table holds ${stats.total} live row(s)`)
  console.log('PASSED')
}

main().catch((err) => {
  console.error('FAILED', err instanceof Error ? err.message : err)
  process.exit(1)
})
