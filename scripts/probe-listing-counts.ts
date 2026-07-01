/**
 * Compare listing counts: DB raw, DB filtered, fetchActiveListingsForCity, RETS city vs zip.
 */
import {
  fetchActiveListingsForCity,
  filterMarketListings,
  hasLocalListingsCache,
  getLastFullSync,
} from '../lib/listings-store'
import { readListingsFromDb } from '../lib/listings-db'
import {
  TMRE_TOWNS,
  filterListingsForTown,
  listingZipMatchesTown,
  type TmreTown,
} from '../lib/tmre-towns'
import { searchListings } from '../lib/rets'

function mapListingsFilter<T extends { price?: number | null; address: { postalCode?: string | null } }>(
  listings: T[],
  town: TmreTown,
): T[] {
  return listings.filter(
    (l) => l.price != null && l.price > 0 && listingZipMatchesTown(l.address.postalCode, town),
  )
}

async function main() {
  console.log('last_full_sync:', getLastFullSync())
  console.log('hasLocalListingsCache:', hasLocalListingsCache())
  console.log('')

  const header = [
    'Town',
    'DB raw',
    'DB market',
    'DB town-filter',
    'fetch(500)',
    'src',
    'RETS city',
    'RETS+zip',
    'Intel-like',
  ]
  console.log(header.join('\t'))

  for (const town of TMRE_TOWNS) {
    const dbRaw = readListingsFromDb(town, 'Active') ?? []
    const dbMarket = filterMarketListings(dbRaw)
    const dbTown = filterListingsForTown(dbMarket, town)

    let fetchCount = 0
    let fetchSource = '?'
    try {
      const { listings, source } = await fetchActiveListingsForCity(town, 500)
      fetchCount = listings.length
      fetchSource = source
    } catch (e) {
      fetchSource = `err:${e instanceof Error ? e.message : String(e)}`
    }

    let retsCity = 0
    let retsZip = 0
    try {
      const [active, coming] = await Promise.all([
        searchListings({ city: town, status: 'Active', limit: 500 }),
        searchListings({ city: town, status: 'Coming Soon', limit: 500 }).catch(() => []),
      ])
      retsCity = filterListingsForTown(filterMarketListings([...active, ...coming]), town).length

      const { zipsForTown } = await import('../lib/tmre-towns')
      const perZip = Math.max(50, Math.ceil(500 / zipsForTown(town).length))
      const zipBatches = await Promise.all(
        zipsForTown(town).flatMap((zip) => [
          searchListings({ zip, status: 'Active', limit: perZip }).catch(() => []),
          searchListings({ zip, status: 'Coming Soon', limit: perZip }).catch(() => []),
        ]),
      )
      retsZip = filterListingsForTown(filterMarketListings(zipBatches.flat()), town).length
    } catch (e) {
      retsCity = -1
      retsZip = -1
    }

    const intelLike = mapListingsFilter(dbTown, town).length

    console.log(
      [
        town,
        dbRaw.length,
        dbMarket.length,
        dbTown.length,
        fetchCount,
        fetchSource,
        retsCity,
        retsZip,
        intelLike,
      ].join('\t'),
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
