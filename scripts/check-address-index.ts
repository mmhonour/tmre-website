import { gzipSync, brotliCompressSync } from 'node:zlib'
import { decodeAddressIndex } from '../lib/address-index/decode'
import { addressIndexPayloadBytes, encodeAddressIndex } from '../lib/address-index/encode'
import { searchAddressIndex } from '../lib/address-index/search'
import { readAddressIndexSourceRows } from '../lib/db/address-index-repo'
import { isTmreTown, resolveListingTown, TMRE_TOWNS } from '../lib/tmre-towns'

const QUERIES = [
  '42 treadwell',
  'tre',
  'treadwell avenue',
  '87 kings hwy s',
  'kings highway south, westport',
  '06880',
  '24192179',
  'main st norwalk',
  '16-1/2 west main',
  'compo rd s',
]

async function main() {
  const rows = await readAddressIndexSourceRows(TMRE_TOWNS)
  const input = rows
    .map((row) => ({
      town: resolveListingTown(row.town) ?? row.town.trim(),
      streetLine: row.street_line,
      zip: row.zip,
      mlsId: row.mls_id,
      onMarket: row.on_market === true,
      rental: row.is_rental === true,
      priceK: row.price_k,
      closeYear: row.close_year,
    }))
    .filter((row) => isTmreTown(row.town))

  const payload = encodeAddressIndex(input, new Date().toISOString())
  const json = JSON.stringify(payload)
  const raw = addressIndexPayloadBytes(payload)
  const gzip = gzipSync(json).length
  const brotli = brotliCompressSync(json).length

  const coldStart = Date.now()
  decodeAddressIndex(payload)
  const coldDecodeMs = Date.now() - coldStart
  const warmStart = Date.now()
  const index = decodeAddressIndex(payload)
  const warmDecodeMs = Date.now() - warmStart

  console.log('--- size ---')
  console.log(`source rows      ${rows.length}`)
  console.log(`addresses        ${payload.addresses}`)
  console.log(`streets          ${payload.streets.length}`)
  console.log(`towns            ${payload.towns.join(', ')}`)
  console.log(`raw              ${(raw / 1024).toFixed(1)} KB`)
  console.log(`gzip             ${(gzip / 1024).toFixed(1)} KB`)
  console.log(`brotli           ${(brotli / 1024).toFixed(1)} KB`)
  console.log(`decode           ${coldDecodeMs} ms cold / ${warmDecodeMs} ms warm`)

  // Warm the JIT so the per-query numbers below reflect steady-state typing.
  for (let i = 0; i < 50; i += 1) {
    for (const q of QUERIES) searchAddressIndex(index, q, { limit: 5 })
  }

  console.log('\n--- queries ---')
  for (const q of QUERIES) {
    const t0 = process.hrtime.bigint()
    const hits = searchAddressIndex(index, q, { limit: 5, biasTown: 'Westport' })
    const us = Number(process.hrtime.bigint() - t0) / 1000
    console.log(`\n"${q}" — ${hits.length} hits in ${us.toFixed(0)}µs`)
    for (const hit of hits) {
      const price = hit.priceK
        ? hit.rental
          ? `$${(hit.priceK * 1000).toLocaleString()}/mo`
          : `$${(hit.priceK / 1000).toFixed(2)}M`
        : '—'
      const tail =
        hit.kind === 'street'
          ? `${hit.addresses} homes`
          : `${hit.mlsId} ${hit.onMarket ? 'on-market' : `closed ${hit.closeYear || '?'}`} ${price}`
      console.log(`  ${hit.kind.padEnd(7)} ${hit.label}, ${hit.town} · ${tail}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
