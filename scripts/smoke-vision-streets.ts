/**
 * vision_streets table smoke (CLI).
 *
 * Writes only under town `__smoke` and deletes it before exit.
 *
 *   npm run smoke:vision-streets
 */

import { streetNamesFromLetterHtml } from '../lib/vision-gis-parse'
import {
  countVisionStreets,
  ensureVisionStreetsTable,
  listVisionStreetLetters,
  listVisionStreetParcels,
  listVisionStreetPidsMissingOwner,
  listVisionStreets,
  listVisionStreetsMissingParcels,
  replaceVisionStreetParcels,
  replaceVisionStreetsForLetter,
} from '../lib/db/vision-streets-repo'
import { compareAddressLabels } from '../lib/vision-streets-page'
import { missingVisionStreetLetters } from '../lib/vision-gis-towns'
import { ensureVisionAddressesTable } from '../lib/db/vision-addresses-repo'
import { execute } from '../lib/db/postgres'

const TOWN = '__smoke'
const URL_C = 'https://gis.vgsi.com/westportct/Streets.aspx?Letter=C'
const URL_A = 'https://gis.vgsi.com/westportct/Streets.aspx?Letter=A'

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}

async function main() {
  console.log('vision streets smoke')
  await ensureVisionStreetsTable()
  await ensureVisionAddressesTable()
  await execute(`DELETE FROM vision_addresses WHERE town = $1`, [TOWN])
  await execute(`DELETE FROM vision_street_parcels WHERE town = $1`, [TOWN])
  await execute(`DELETE FROM vision_streets WHERE town = $1`, [TOWN])
  console.log('PASS  vision_streets exists')

  const sampleHtml = `
    <a href="Streets.aspx?Name=Compo+Road+South">Compo Road South</a>
    <a href="Streets.aspx?Name=Cross%20Highway">Cross Highway</a>
    <a href="Streets.aspx?Name=Compo+Road+South">Compo Road South</a>
  `
  const parsed = streetNamesFromLetterHtml(sampleHtml)
  assert(parsed.length === 2, `parser expected 2 unique names, got ${parsed.length}`)
  assert(parsed.includes('Compo Road South'), 'parser missed Compo Road South')
  console.log('PASS  Streets.aspx?Name= parser')

  const first = await replaceVisionStreetsForLetter(
    TOWN,
    'C',
    parsed,
    URL_C,
  )
  assert(first.written === 2, `expected written 2, got ${first.written}`)
  await replaceVisionStreetsForLetter(TOWN, 'A', ['Adams Lane'], URL_A)
  const all = await listVisionStreets(TOWN)
  assert(all.length === 3, `expected 3 streets, got ${all.length}`)
  console.log('PASS  two letters sit side by side')

  const letters = await listVisionStreetLetters(TOWN)
  assert(letters.join('') === 'AC', `letters expected AC, got ${letters.join('')}`)
  const missing = missingVisionStreetLetters(letters)
  assert(!missing.includes('A') && !missing.includes('C'), 'A and C should not be missing')
  assert(missing[0] === 'B', `first missing should be B, got ${missing[0]}`)
  assert(
    missingVisionStreetLetters(['B']).includes('A'),
    'mid-crawl B-only must still list A as missing',
  )
  console.log('PASS  missing letters ignore already-stored buckets')

  const second = await replaceVisionStreetsForLetter(
    TOWN,
    'C',
    ['Compo Road South'],
    URL_C,
  )
  assert(second.written === 1, `expected written 1, got ${second.written}`)
  const after = await listVisionStreets(TOWN)
  const names = after.map((s) => s.streetName).sort()
  assert(
    names.join('|') === 'Adams Lane|Compo Road South',
    `letter replace spilled: ${names.join('|')}`,
  )
  console.log('PASS  letter replace does not touch other letters')

  const n = await countVisionStreets(TOWN)
  assert(n === 2, `count expected 2, got ${n}`)

  const locustUrl = 'https://gis.vgsi.com/westportct/Streets.aspx?Name=Locust+Ln'
  const firstParcels = await replaceVisionStreetParcels(
    TOWN,
    'Locust Ln',
    [
      { visionPid: '2', addressLabel: '6 Locust Ln' },
      { visionPid: '1', addressLabel: '5 Locust Ln' },
      { visionPid: '1', addressLabel: '5 Locust Ln' },
    ],
    locustUrl,
  )
  assert(firstParcels.written === 2, `expected 2 parcels, got ${firstParcels.written}`)
  await replaceVisionStreetParcels(
    TOWN,
    'Main St',
    [{ visionPid: '9', addressLabel: '1 Main St' }],
    'https://gis.vgsi.com/westportct/Streets.aspx?Name=Main+St',
  )
  const locust = (await listVisionStreetParcels(TOWN, 'Locust Ln')).sort((a, b) =>
    compareAddressLabels(a.addressLabel, b.addressLabel),
  )
  assert(locust.map((p) => p.addressLabel).join('|') === '5 Locust Ln|6 Locust Ln', 'sort/list failed')
  const stillMain = await listVisionStreetParcels(TOWN, 'Main St')
  assert(stillMain.length === 1, 'street replace spilled onto Main St')
  await replaceVisionStreetParcels(
    TOWN,
    'Locust Ln',
    [{ visionPid: '1', addressLabel: '5 Locust Ln' }],
    locustUrl,
  )
  const afterLocust = await listVisionStreetParcels(TOWN, 'Locust Ln')
  assert(afterLocust.length === 1, `expected Locust cut to 1, got ${afterLocust.length}`)
  assert((await listVisionStreetParcels(TOWN, 'Main St')).length === 1, 'Main St wiped')
  const missingHouses = await listVisionStreetsMissingParcels(TOWN, 10)
  assert(missingHouses.includes('Adams Lane'), 'Adams Lane should still need houses')
  assert(!missingHouses.includes('Locust Ln'), 'Locust Ln should not be missing houses')
  await replaceVisionStreetParcels(
    TOWN,
    'Adams Lane',
    [{ visionPid: '3', addressLabel: '1 Adams Lane' }],
    'https://gis.vgsi.com/westportct/Streets.aspx?Name=Adams+Lane',
  )
  const missingAfterStamp = await listVisionStreetsMissingParcels(TOWN, 10)
  assert(
    !missingAfterStamp.includes('Adams Lane'),
    'stamped street should leave the missing list',
  )
  assert(compareAddressLabels('5 Locust Ln', '12 Locust Ln') < 0, '5 should sort before 12')
  console.log('PASS  street parcel replace is street-scoped')

  const missingOwners = await listVisionStreetPidsMissingOwner(TOWN, 10)
  assert(
    missingOwners.some((row) => row.visionPid === '1'),
    'Locust PID without Field Card should be missing owner',
  )
  const locustWithOwner = await listVisionStreetParcels(TOWN, 'Locust Ln')
  assert(
    locustWithOwner.every((row) => row.ownerName == null),
    'joined owner should be empty before ingest',
  )
  await execute(
    `INSERT INTO vision_addresses (
       town, vision_pid, parcel_url, owner_name, owner_mailing_address,
       last_sale_date, field_card, source_host, scraped_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, now(), now())
     ON CONFLICT (town, vision_pid) DO UPDATE SET
       owner_name = EXCLUDED.owner_name,
       owner_mailing_address = EXCLUDED.owner_mailing_address,
       last_sale_date = EXCLUDED.last_sale_date,
       field_card = EXCLUDED.field_card`,
    [
      TOWN,
      '1',
      'https://example.test/parcel',
      'SMITH JOHN',
      '9 PINE ST, WESTPORT, CT',
      '03/12/2019',
      JSON.stringify({
        version: 1,
        fields: [
          { section: 'Parcel', label: 'Owner address', value: '9 PINE ST, WESTPORT, CT' },
        ],
        searchText: 'SMITH JOHN 9 PINE ST',
      }),
      'test',
    ],
  )
  const afterOwner = await listVisionStreetPidsMissingOwner(TOWN, 10)
  assert(
    !afterOwner.some((row) => row.visionPid === '1'),
    'PID with owner and mailing should leave the missing-owner queue',
  )
  const locustOwned = await listVisionStreetParcels(TOWN, 'Locust Ln')
  assert(
    locustOwned.some(
      (row) =>
        row.visionPid === '1' &&
        row.ownerName === 'SMITH JOHN' &&
        row.ownerMailingAddress === '9 PINE ST, WESTPORT, CT',
    ),
    'street list should join owner_name and mailing',
  )
  console.log('PASS  street parcel owner join and missing-owner queue')

  await execute(`DELETE FROM vision_addresses WHERE town = $1`, [TOWN])
  await execute(`DELETE FROM vision_street_parcels WHERE town = $1`, [TOWN])
  await execute(`DELETE FROM vision_streets WHERE town = $1`, [TOWN])
  console.log('PASS  cleanup')
  console.log('PASSED')
}

main().catch((err) => {
  console.error('FAILED', err instanceof Error ? err.message : err)
  process.exit(1)
})
