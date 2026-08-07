import {
  ADDRESS_FLAG_ON_MARKET,
  ADDRESS_FLAG_RENTAL,
  ADDRESS_INDEX_FIELD_SEP,
  ADDRESS_INDEX_ROW_SEP,
  ADDRESS_INDEX_STREET_SEP,
  ADDRESS_INDEX_VERSION,
  splitHouseNumber,
  type AddressIndexPayload,
} from '@/lib/address-index/schema'

export type AddressIndexInputRow = {
  town: string
  streetLine: string
  zip: string | null
  mlsId: string
  onMarket: boolean
  rental: boolean
  /**
   * Sale price in thousands, or monthly rent in thousands when `rental`.
   * Closed prices never change; live list prices are corrected on hydrate.
   */
  priceK: number | null
  closeYear: number | null
}

export function encodeAddressIndex(
  rows: readonly AddressIndexInputRow[],
  generatedAt: string,
): AddressIndexPayload {
  const towns: string[] = []
  const townIndex = new Map<string, number>()
  const streets: string[] = []
  const streetIndex = new Map<string, number>()
  const lines: string[] = []

  for (const row of rows) {
    const town = row.town.trim()
    const mlsId = row.mlsId.trim()
    if (!town || !mlsId) continue

    const { house, street } = splitHouseNumber(row.streetLine)
    if (!street) continue

    let townIdx = townIndex.get(town)
    if (townIdx === undefined) {
      townIdx = towns.length
      towns.push(town)
      townIndex.set(town, townIdx)
    }

    const streetKey = `${street}${ADDRESS_INDEX_STREET_SEP}${townIdx}`
    let streetIdx = streetIndex.get(streetKey)
    if (streetIdx === undefined) {
      streetIdx = streets.length
      streets.push(streetKey)
      streetIndex.set(streetKey, streetIdx)
    }

    const flags =
      (row.onMarket ? ADDRESS_FLAG_ON_MARKET : 0) | (row.rental ? ADDRESS_FLAG_RENTAL : 0)

    lines.push(
      [
        house,
        String(streetIdx),
        mlsId,
        String(flags),
        row.priceK != null && row.priceK > 0 ? String(row.priceK) : '',
        row.closeYear != null ? String(row.closeYear) : '',
        row.zip?.trim().slice(0, 5) ?? '',
      ].join(ADDRESS_INDEX_FIELD_SEP),
    )
  }

  return {
    v: ADDRESS_INDEX_VERSION,
    generatedAt,
    towns,
    streets,
    rows: lines.join(ADDRESS_INDEX_ROW_SEP),
    addresses: lines.length,
  }
}

/** Byte size of the payload as it goes over the wire before compression. */
export function addressIndexPayloadBytes(payload: AddressIndexPayload): number {
  const json = JSON.stringify(payload)
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length
  return Buffer.byteLength(json, 'utf8')
}
