# Backlog — bring Commercial into the stats cache

| Field | Value |
|-------|-------|
| **Status** | Not started — handed off for local agent work |
| **Raised** | 31 Aug 2026, while making Market Pulse read cached figures only |
| **Companion docs** | [PRODUCT-OVERVIEW.md](./PRODUCT-OVERVIEW.md) |

---

## The problem

Every Market Pulse property tab except one reads its figures from the
`market-stats:{city}:{kind}` rows in `stats_cache`, written at rebuild. Nothing
is derived on read: median, average, delta, avg days on market and list to ask
are all stored, each with its own cached explanation.

**Commercial is the exception.** `buildCommercialCategorySlice()` in
`lib/market-digest.ts` queries Active and recent Closed straight from Postgres
on every page build and computes its figures in the request:

- `priceRowFromListings()` — median and average from **active list prices**,
  where the cached tabs use closed prices.
- `saleToAskFromClosings()` — list to ask over the **last four months** of
  closings, where the cached tabs reach back to 2024.
- `commercialPayload()` — months supply from the same live read.

## Why it matters

1. **The numbers are not comparable.** A visitor switching from SFR to
   Commercial moves from closed-price medians over two years to active-list
   medians over four months, with nothing on screen saying so.
2. **It costs a database round trip per town on every render**, where the other
   tabs cost one cache read.
3. **Delta is now cached everywhere else.** Commercial computes it from live
   figures, so it is the last surface deriving a price figure on read.
4. Missing data shows as `n/a` more often on that tab, because a four-month
   commercial window is thin.

## What the work looks like

1. Give `stats_cache` a commercial scope — either a third `kind`, or a
   `propertyClass`-style dimension on `market-stats`, since commercial is
   currently distinguished by `isCommercialListing()` rather than by `kind`.
2. Compute the commercial pools inside the stats rebuild
   (`lib/stats-cache.ts`), reusing `marketStatsFromPools()` so wording,
   rounding and the delta stay identical to the residential path.
3. Point `buildCommercialCategorySlice()` at the cache and delete the live
   query and the three compute helpers above.
4. Decide the closed window. If commercial keeps a shorter one, say so in the
   cached `calc` text rather than in the component, so the page and the email
   inherit it.
5. Check `/admin` — the stats inventory panel and the diagrams list the cache
   keys, and a new scope has to appear there (see
   `.cursor/rules/admin-diagrams.mdc`).

## Watch out for

- **Months supply on Commercial is legitimately `n/a`** for most towns: too few
  closings to derive a supply figure. Caching will not change that, and it
  should not be made to look like it has.
- The commercial slice also builds its own Deal of the Week and avg DOM; those
  ride the same live read and would move with it.
