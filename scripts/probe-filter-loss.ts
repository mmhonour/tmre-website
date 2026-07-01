import { searchListings } from '../lib/rets'
import { filterMarketListings } from '../lib/listings-store'
import { filterListingsForTown, zipsForTown, TMRE_TOWNS, type TmreTown } from '../lib/tmre-towns'

async function probeTown(town: TmreTown) {
  const [active, coming] = await Promise.all([
    searchListings({ city: town, status: 'Active', limit: 500 }),
    searchListings({ city: town, status: 'Coming Soon', limit: 500 }).catch(() => []),
  ])
  const raw = [...active, ...coming]
  const market = filterMarketListings(raw)
  const filtered = filterListingsForTown(market, town)

  const perZip = Math.max(50, Math.ceil(500 / zipsForTown(town).length))
  const zipBatches = await Promise.all(
    zipsForTown(town).flatMap((zip) => [
      searchListings({ zip, status: 'Active', limit: perZip }).catch(() => []),
      searchListings({ zip, status: 'Coming Soon', limit: perZip }).catch(() => []),
    ]),
  )
  const zipRaw = zipBatches.flat()
  const zipFiltered = filterListingsForTown(filterMarketListings(zipRaw), town)

  const noZip = filtered.filter((l) => !l.address.postalCode?.trim()).length
  const badZip = filtered.filter((l) => {
    const z = l.address.postalCode?.trim().slice(0, 5)
    return z && !zipsForTown(town).includes(z)
  }).length

  console.log(`${town}: city raw=${raw.length} market=${market.length} filtered=${filtered.length} | zip filtered=${zipFiltered.length} | noZip=${noZip} badZip=${badZip}`)
}

async function main() {
  for (const town of TMRE_TOWNS) await probeTown(town)
}
main()
