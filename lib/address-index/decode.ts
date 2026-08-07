import {
  ADDRESS_FLAG_ON_MARKET,
  ADDRESS_FLAG_RENTAL,
  ADDRESS_INDEX_FIELD_SEP,
  ADDRESS_INDEX_ROW_SEP,
  ADDRESS_INDEX_STREET_SEP,
  houseNumberValue,
  normalizeStreetText,
  type AddressIndexPayload,
} from '@/lib/address-index/schema'

/**
 * Resident form of the index. Street text is held once per street and every
 * per-address field lives in a parallel array, so 18k+ addresses cost about a
 * megabyte and matching never allocates.
 */
export type AddressIndex = {
  version: number
  generatedAt: string
  towns: string[]
  /** Display street line, e.g. `Treadwell Avenue`. */
  streetNames: string[]
  /** Match form of the same street, e.g. `treadwell ave`. */
  streetMatch: string[]
  streetTown: Uint8Array
  /** Row offsets per street, so a street match never scans the whole index. */
  byStreet: number[][]
  addresses: number
  house: string[]
  houseValue: Int32Array
  street: Uint16Array
  mlsId: string[]
  onMarket: Uint8Array
  rental: Uint8Array
  priceK: Int32Array
  closeYear: Int16Array
  zip: (string | null)[]
}

export function decodeAddressIndex(payload: AddressIndexPayload): AddressIndex {
  const streetNames: string[] = []
  const streetMatch: string[] = []
  const streetTown = new Uint8Array(payload.streets.length)

  payload.streets.forEach((entry, i) => {
    const parts = entry.split(ADDRESS_INDEX_STREET_SEP)
    const name = parts[0] ?? ''
    streetNames.push(name)
    streetMatch.push(normalizeStreetText(name))
    streetTown[i] = Number(parts[1] ?? 0)
  })

  const lines = payload.rows ? payload.rows.split(ADDRESS_INDEX_ROW_SEP) : []
  const count = lines.length
  const house: string[] = new Array(count)
  const houseValue = new Int32Array(count)
  const street = new Uint16Array(count)
  const mlsId: string[] = new Array(count)
  const onMarket = new Uint8Array(count)
  const rental = new Uint8Array(count)
  const priceK = new Int32Array(count)
  const closeYear = new Int16Array(count)
  const zip: (string | null)[] = new Array(count)
  const byStreet: number[][] = payload.streets.map(() => [])

  for (let i = 0; i < count; i += 1) {
    const parts = lines[i]!.split(ADDRESS_INDEX_FIELD_SEP)
    const houseText = parts[0] ?? ''
    const streetIdx = Number(parts[1] ?? 0)
    const flags = Number(parts[3] ?? 0)
    house[i] = houseText
    houseValue[i] = houseNumberValue(houseText)
    street[i] = streetIdx
    mlsId[i] = parts[2] ?? ''
    onMarket[i] = flags & ADDRESS_FLAG_ON_MARKET ? 1 : 0
    rental[i] = flags & ADDRESS_FLAG_RENTAL ? 1 : 0
    priceK[i] = parts[4] ? Number(parts[4]) : -1
    closeYear[i] = parts[5] ? Number(parts[5]) : 0
    zip[i] = parts[6] || null
    byStreet[streetIdx]?.push(i)
  }

  return {
    version: payload.v,
    generatedAt: payload.generatedAt,
    towns: payload.towns,
    streetNames,
    streetMatch,
    streetTown,
    byStreet,
    addresses: count,
    house,
    houseValue,
    street,
    mlsId,
    onMarket,
    rental,
    priceK,
    closeYear,
    zip,
  }
}
