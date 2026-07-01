import { syncTownListings } from '../lib/listings-sync'
import { readListingsFromDb } from '../lib/listings-db'

async function main() {
  const town = (process.argv[2] ?? 'Westport') as import('../lib/tmre-towns').TmreTown
  const before = readListingsFromDb(town, 'Active').length
  console.log(`${town} Active before:`, before)
  const result = await syncTownListings(town, 'Active')
  console.log('Sync result:', result)
  const after = readListingsFromDb(town, 'Active').length
  console.log(`${town} Active after:`, after)
}

main()
