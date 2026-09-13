import 'server-only'

import { buildComparableListing, subjectComparablesCriteria } from '@/lib/listing-comparables'
import {
  FIND_PARCEL_MAP_POOL_MILES,
  FIND_PARCEL_MAP_RADIUS_MILES,
  classifyFindParcelRelation,
  criteriaFromParcelFacts,
  milesBetween,
  type FindParcelMapNeighbor,
  type FindParcelMapPayload,
  type FindParcelMapPin,
} from '@/lib/find-parcel-map-shared'
import { findListingInDbByVisionAddress } from '@/lib/find-listing-ingest'
import { getVisionAddress } from '@/lib/db/vision-addresses-repo'
import { readListingByIdFromDb, readTownListingsNear } from '@/lib/db/listings-repo'
import { mergeWestportProperty } from '@/lib/westport-lookup'
import { listingDetailHref } from '@/lib/listing-url'
import { isRentalListing } from '@/lib/listing-kind'
import { primaryListingPrice } from '@/lib/listing-history'
import { mapBoundZipsForListing } from '@/lib/tmre-towns'
import type { Listing } from '@/lib/rets'

const TOWN = 'Westport'
const DEG_PER_MILE = 1 / 69

function listingToPin(listing: Listing, fallbackPrice: number): FindParcelMapPin {
  const price = primaryListingPrice(listing) ?? listing.price ?? fallbackPrice
  return {
    key: listing.listingKey || listing.mlsId,
    address: listing.address.street || listing.address.full || listing.mlsId,
    city: listing.address.city,
    price: price > 0 ? price : fallbackPrice,
    score: 0,
    isRental: isRentalListing(listing),
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    latitude: listing.latitude,
    longitude: listing.longitude,
    photoCount: listing.photoCount,
  }
}

export async function loadFindParcelMap(
  visionPid: string,
): Promise<FindParcelMapPayload | null> {
  const property = await mergeWestportProperty(visionPid, { ingest: false })
  if (!property) return null

  const vision = await getVisionAddress(TOWN, visionPid)
  const linked =
    (property.listing
      ? await readListingByIdFromDb(property.listing.mlsId)
      : null) ??
    (vision ? await findListingInDbByVisionAddress(vision) : null)

  const subjectLat = linked?.latitude ?? null
  const subjectLon = linked?.longitude ?? null
  const fallbackPrice =
    property.price.value ?? property.lastSoldPrice ?? 1
  const subject: FindParcelMapPin | null =
    linked && subjectLat != null && subjectLon != null
      ? listingToPin(linked, fallbackPrice)
      : subjectLat != null && subjectLon != null
        ? {
            key: `vision:${visionPid}`,
            address: property.street,
            city: TOWN,
            price: fallbackPrice,
            score: 0,
            isRental: false,
            beds: property.beds.value,
            baths: property.baths.value,
            sqft: property.sqft.value,
            latitude: subjectLat,
            longitude: subjectLon,
            photoCount: property.listing?.photoCount ?? null,
          }
        : null

  const fromListing = linked ? subjectComparablesCriteria(linked) : null
  const fromFacts = criteriaFromParcelFacts({
    zip: linked?.address.postalCode ?? '06880',
    beds: property.beds.value,
    baths: property.baths.value,
    sqft: property.sqft.value,
    yearBuilt: property.yearBuilt.value,
  })
  const criteria = fromListing?.criteria ?? fromFacts.criteria
  const missingCriteria = criteria
    ? []
    : fromListing?.missingCriteria?.length
      ? fromListing.missingCriteria
      : fromFacts.missingCriteria

  const { boundZips, highlightZip } = mapBoundZipsForListing(
    TOWN,
    linked?.address.postalCode ?? '06880',
  )

  if (!subject || subject.latitude == null || subject.longitude == null) {
    return {
      street: property.street,
      subject: null,
      subjectKey: null,
      radiusMiles: FIND_PARCEL_MAP_RADIUS_MILES,
      neighbors: [],
      criteria,
      missingCriteria,
      boundZips,
      highlightZip,
    }
  }

  const pool = await readTownListingsNear({
    town: TOWN,
    latitude: subject.latitude,
    longitude: subject.longitude,
    radiusDeg: FIND_PARCEL_MAP_POOL_MILES * DEG_PER_MILE,
  })

  const subjectKey = subject.key
  const neighbors: FindParcelMapNeighbor[] = []
  for (const listing of pool) {
    if (listing.latitude == null || listing.longitude == null) continue
    const key = listing.listingKey || listing.mlsId
    if (key === subjectKey || listing.mlsId === linked?.mlsId) continue
    const miles = milesBetween(
      { lat: subject.latitude, lon: subject.longitude },
      { lat: listing.latitude, lon: listing.longitude },
    )
    const neighborStreet =
      listing.address.street || listing.address.full || ''
    const relation = classifyFindParcelRelation(
      property.street,
      neighborStreet,
      miles,
    )
    if (!relation) continue
    const comp = buildComparableListing(listing)
    neighbors.push({
      pin: listingToPin(listing, fallbackPrice),
      relation,
      miles,
      zip: comp.zip,
      vintageLabel: comp.vintageLabel,
      yearBuilt: comp.yearBuilt,
      furnished: comp.furnished,
      href: listingDetailHref(
        listing.mlsId,
        listing.address.street,
        listing.address.city,
      ),
    })
  }

  neighbors.sort((a, b) => a.miles - b.miles)

  return {
    street: property.street,
    subject,
    subjectKey,
    radiusMiles: FIND_PARCEL_MAP_RADIUS_MILES,
    neighbors,
    criteria,
    missingCriteria,
    boundZips,
    highlightZip,
  }
}
