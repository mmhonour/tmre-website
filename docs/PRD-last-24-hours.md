# Product Requirements Document — TMRE Platform Expansion

| Field | Value |
|-------|-------|
| **Document title** | TMRE Intelligence, SQLite Caching & Listing Platform Expansion |
| **Date range** | July 4, 2026 ~12:30 PM – July 5, 2026 ~12:36 PM (UTC-4) |
| **Author / source** | Commit `99e5804` — *Expand intelligence deal board, SQLite caching, and listing platform.* |
| **Status** | **Local commit only** (`main` ahead of `origin/main` by 1); not yet pushed to GitHub |
| **Scope** | 165 files changed (+17,364 / −2,183 lines) across Intelligence, listing detail, Spotlight, SQLite infrastructure, Deal of the Day, expired listings, scoring, navigation, and Netlify deployment |

---

## 1. Executive Summary

This release transforms TMRE from a listings browser into a research platform centered on the **Intelligence deal board**, a **SQLite-backed read layer**, and **rich listing detail tabs** (comparables, rental comps, If estimates, property taxes, owner history). Photo-led board layouts (Grid, Large, Line) surface deal superlatives, lot acres, and year-built metadata. A separate **listing-photos.db** isolates photo blobs; **listings.read.db** serves API reads while sync writes to the primary DB. **Spotlight** mirrors the listing layout with privacy controls for a curated featured property. **Expired listings**, **Lookey** recording, and **hourly stats cache** rebuilds round out operational coverage. Goldilocks scoring now assigns **condition 100** to fresh first-sale new construction unless downgrade keywords appear.

---

## 2. Goals & Success Metrics

| Goal | Success metric |
|------|----------------|
| Faster, richer deal discovery | Users can switch Grid / Large / Line views; board renders photo-led rows with score, superlatives, acres, and year built |
| Reliable offline-capable reads | API routes read from `listings.read.db`; photo blobs served from `listing-photos.db` without blocking sync |
| Deeper listing research | Listing and Spotlight pages expose Comparables, Comparable Rentals, If, History, and property tax modals |
| Transparent data freshness | `/api/intelligence/refresh-status` reflects in-progress sync; Intelligence UI polls and shows last refresh |
| Production deployability | Netlify build runs `sync:listings` against bundled DB; native modules externalized in config |
| Accurate value scoring | Fresh new-construction listings score condition 100; rehab superlatives require evidence keywords |

---

## 3. Feature Requirements by Product Area

### 3.1 Intelligence Deal Board

| ID | Requirement | Acceptance criteria | Status |
|----|-------------|---------------------|--------|
| INT-001 | Photo-led deal board with three view modes | User selects **Large**, **Grid**, or **Line** via `DealBoardViewPicker`; preference persisted in `localStorage` (`intel-board-view`); default **Grid** | Done |
| INT-002 | Deal board row metadata | Each row shows thumbnail, Goldilocks score, superlatives, **lot acres**, and **year built** (adaptive labels in `deal-board-shared.tsx`) | Done |
| INT-003 | Tiered board layout | Top / middle / can tiers with **middle tier collapse/expand** (`DealBoardMiddleTierToggle`) | Done |
| INT-004 | Board sorting | `DealBoardSortBar` supports sort modes defined in `deal-board-sort.ts` | Done |
| INT-005 | Deal superlatives | `deriveDealSuperlatives` generates headline words from score dimensions; rehab superlatives require rehab evidence in remarks | Done |
| INT-006 | Vintage filtering & stats | Vintage era slider filters board; `IntelligenceVintageStats` shows bucket breakdown; `vintage-buckets` taxonomy | Done |
| INT-007 | All-towns descriptor | `AllTownsDescriptor` calls `/api/intelligence/all-towns-descriptor` with filter context; fallback synthesis when API unavailable | Done |
| INT-008 | Live SQLite refresh status | Client polls `/api/intelligence/refresh-status`; UI indicates refreshing vs idle and last finished timestamp | Done |
| INT-009 | Closed listings API | `/api/intelligence/closed-listings` serves closed/sold inventory for intelligence filters | Done |
| INT-010 | Board layout preview (internal) | `/intelligence/board-preview` and `/intelligence/board-preview/option-1` — noindex test routes with mock/live sample listings | Done |
| INT-011 | Price & search URL helpers | `intel-price-filter.ts`, `intelligence-search-url.ts`, snapshot collapse toggle for filter UI | Done |

### 3.2 SQLite Architecture & Caching

| ID | Requirement | Acceptance criteria | Status |
|----|-------------|---------------------|--------|
| SQL-001 | Read-only listings snapshot | After sync/cache rebuild, `publishListingsReadSnapshot()` copies write DB to `listings.read.db`; API reads use read connection | Done |
| SQL-002 | Separate photo blob store | `listing-photos.db` holds `listing_photos` table; migration from legacy blobs in `listings.db` on first open | Done |
| SQL-003 | Non-blocking refresh tracking | `beginSqliteRefresh` / `endSqliteRefresh` maintain depth counter and `refresh_in_progress` meta; stats rebuild skips while refresh active | Done |
| SQL-004 | Refresh status endpoint | `GET /api/intelligence/refresh-status` returns `{ refreshing, lastFinishedAt }` | Done |
| SQL-005 | Listing cache warm API | `GET /api/listings/[mlsId]/cache` pre-warms listing payload for hover/navigation | Done |
| SQL-006 | Hourly stats cache | `STATS_CACHE_TTL_MS` = 1 hour; `rebuildStatsCacheIfStale` scheduled in `instrumentation.ts` (production/Netlify) | Done |
| SQL-007 | Bundled DB for serverless | `data/listings.bundle.db` seeded to `/tmp` on cold start; gitignored runtime DBs documented in `.gitignore` | Done |
| SQL-008 | Dev workflow | Background sync disabled in dev unless `ENABLE_BACKGROUND_SQLITE_REFRESH=1`; dev runs `npm run sync:listings` manually | Done |

### 3.3 Listing Detail Pages

| ID | Requirement | Acceptance criteria | Status |
|----|-------------|---------------------|--------|
| LST-001 | Tabbed sub-navigation | Tabs: Overview, Photos, Comparables, Comparable Rentals, History, If — via `ListingSubnav` and `listing-url` helpers | Done |
| LST-002 | Hero layout refactor | `ListingHeroPanels`, `ListingHeader`, `ListingSidebar`, `ListingOverviewPanels` unify layout shell | Done |
| LST-003 | Comparables tab | `/listings/[mlsId]/comparables` + `ListingComparablesPanel`; API `/api/listings/[mlsId]/comparables` with scoring in `listing-comparables*.ts` | Done |
| LST-004 | Comparable rentals tab | `/listings/[mlsId]/comparable-rentals` + API route | Done |
| LST-005 | If estimates tab | `/listings/[mlsId]/if` + `ListingIfPanel`; weighted comp-based sale/rent ranges in `listing-if-estimates.ts`; API `/api/listings/[mlsId]/if` | Done |
| LST-006 | Property tax history | `/api/listings/[mlsId]/property-taxes`; `PropertyTaxHistoryModal` in schools/details panel | Done |
| LST-007 | Photo gallery & thumbs | `ListingPhotoThumbGrid`, `ListingThumbImage`, `ListingThumbPriority`; photo route serves from photo DB with improved caching | Done |
| LST-008 | Listing history | `ListingHistoryClient` refactor; `ListingHistoryModal` for inline history | Done |
| LST-009 | Value score badge | `ListingValueScoreBadge` in header; breakdown modal on click | Done |
| LST-010 | Looked-at recording | `useRecordLookedAtListing` hook records views to local Lookey store when listing loads | Done |
| LST-011 | Photo obfuscation | `ListingPhotoObfuscation` for sensitive photo handling where configured | Done |

### 3.4 Spotlight Pages

| ID | Requirement | Acceptance criteria | Status |
|----|-------------|---------------------|--------|
| SPL-001 | Featured listing config | `SPOTLIGHT_LISTING` in `lib/spotlight-listing.ts`; MLS-backed photos/remarks when `mlsId` set | Done |
| SPL-002 | Fixed URL structure | `/spotlight`, `/spotlight/photos`, `/spotlight/history`, `/spotlight/comparables`, `/spotlight/comparable-rentals`, `/spotlight/if` — no MLS id in URL | Done |
| SPL-003 | Privacy mode | Header hides address/status/DOM; map hides pin; marketing title only (`SpotlightPageChrome`, `variant="spotlight"`) | Done |
| SPL-004 | Shared listing layout | Same `ListingHeroPanels` / tab content as property pages | Done |
| SPL-005 | Spotlight API | `GET /api/spotlight` resolves listing, optional photos, Goldilocks score; `GET /api/spotlight/comparables` for comp data | Done |
| SPL-006 | Redirect | `/spotlight.html` → `/spotlight` (permanent) in `next.config.ts` | Done |

### 3.5 Deal of the Day

| ID | Requirement | Acceptance criteria | Status |
|----|-------------|---------------------|--------|
| DOTD-001 | Enhanced hero | `DealOfTheWeekHero` uses deal superlatives, sentence splitting, personalized town pills | Done |
| DOTD-002 | Photo thumbnail deck | `DealPhotoThumbnailDeck` + `DealOfTheDayFrame` layout updates | Done |
| DOTD-003 | Carousel hook | `useDealOfTheDayCarousel` adjustments for multi-deal navigation | Done |
| DOTD-004 | Cache warming | `warm-listing-cache` / `prefetch-listing-images` on hover for faster detail loads | Done |
| DOTD-005 | API touch | Minor updates to `/api/deal-of-the-day/route.ts` | Done |

> **Full selection logic:** See [§9 Business Logic — Deal of the Day](#9-business-logic--deal-of-the-day).

### 3.6 Scoring & Goldilocks

| ID | Requirement | Acceptance criteria | Status |
|----|-------------|---------------------|--------|
| SCR-001 | New construction condition 100 | `isFreshFirstSaleNewConstruction` → condition score **100** unless `CONDITION_DOWNGRADE_KEYWORDS` present | Done |
| SCR-002 | Deal superlatives integration | Superlatives derived from age, condition, finishes, layout, schools, DOM, lot acres | Done |
| SCR-003 | Detail page scoring | `scoreListingForDetailPage` used on listing and spotlight APIs | Done |
| SCR-004 | Score explain modal | `goldilocks-score-info.ts` updates for new construction messaging | Done |

> **Full algorithm specification:** See [§8 Business Logic — Goldilocks Algorithm](#8-business-logic--goldilocks-algorithm).

### 3.7 Expired Listings & New Construction

| ID | Requirement | Acceptance criteria | Status |
|----|-------------|---------------------|--------|
| EXP-001 | Expired listings page | `/new-construction/expired-listings` with `ExpiredListingsClient` — MLS expired 30+ days across TMRE towns | Done |
| EXP-002 | Expired API | `GET /api/listings/expired` with per-town limit, `expiredDays`, owner name enrichment | Done |
| EXP-003 | Owner display | Owner lookup helper in expired and new-construction clients (`ownerName` from RETS) | Done |
| EXP-004 | New construction refresh | `NewConstructionClient` expanded with owner lookup and layout parity | Done |

### 3.8 Lookey, Find, Fixer Uppers, Stats

| ID | Requirement | Acceptance criteria | Status |
|----|-------------|---------------------|--------|
| LOO-001 | Lookey client updates | `LookeyClient.tsx` improvements for looked-at listing display | Done |
| LOO-002 | Looked-at lib | `looked-at-listings.ts` expanded storage/API | Done |
| FIND-001 | Find page | Minor `FindClient.tsx` updates | Done |
| FIX-001 | Fixer uppers | `FixerUppersClient.tsx` and `fixer-listings.ts` adjustments | Done |
| STA-001 | Stats cache | Hourly rebuild; `sales-by-month` route updates; `MedianPriceListingsTable` tweak | Done |
| STA-002 | Sales by month API | `/api/sales-by-month/route.ts` aligned with SQLite stats rows | Done |

### 3.9 Navigation, Branding & Contact

| ID | Requirement | Acceptance criteria | Status |
|----|-------------|---------------------|--------|
| NAV-001 | Primary nav links | Deal of the Day (bold), Intelligence (bolt icon), **Spotlight** added to `Navigation.tsx` | Done |
| NAV-002 | Explore menu | New Construction, **Expired Listings**, Fixer Uppers, Find under Properties | Done |
| NAV-003 | BHHS branding | Optional BHHS logo link (`SHOW_BHHS_LOGO = false`); remote image pattern for CDN logo in `next.config.ts` | Done |
| NAV-004 | Contact components | `ContactButton`, `ContactFormPanel` updates | Done |
| NAV-005 | Layout fonts | `app/layout.tsx` and `globals.css` styling additions | Done |
| NAV-006 | Zip boundary popover | `ZipBoundaryPopover.tsx` enhancements | Done |

---

## 4. Technical / Infrastructure Requirements

| ID | Requirement | Details | Status |
|----|-------------|---------|--------|
| TECH-001 | Dual SQLite read path | Write: `data/listings.db`; read: `data/listings.read.db`; serverless: `/tmp/listings.db` + `.read.db` | Done |
| TECH-002 | Photo DB path | `data/listing-photos.db` or `/tmp/listing-photos.db`; env overrides `LISTING_PHOTOS_DB_PATH`, `LISTINGS_DB_PATH` | Done |
| TECH-003 | Native module bundling | `better-sqlite3`, `rets-client`, `node-expat`, `bindings` external in Next and Netlify functions | Done |
| TECH-004 | Netlify build pipeline | Build command: `LISTINGS_DB_PATH=data/listings.bundle.db npm run sync:listings && npm run build` | Done |
| TECH-005 | Instrumentation hooks | Listings sync on interval when `LISTINGS_SYNC_INTERVAL_MS` set; stats refresh on `STATS_CACHE_REFRESH_MS` | Done |
| TECH-006 | Geo utilities | `geo-distance.ts`, `tmre-geo.ts` for comp distance and location premium | Done |
| TECH-007 | Intelligence snapshot cache | `intelligence-snapshot-cache.ts` for client-side filter snapshots | Done |
| TECH-008 | Spotlight cache | `spotlight-cache.ts`, `spotlight-display.ts`, `spotlight-subject.ts` | Done |

---

## 5. Non-Functional Requirements

### 5.1 Performance

- API reads must not block on SQLite write/sync; use read snapshot and separate photo DB.
- Stats payloads cached for **1 hour**; rebuild skipped during active listings refresh.
- Listing hover prefetch (`warm-listing-cache`, `prefetch-listing-images`) reduces detail page latency.
- Photo route serves cached blobs from `listing-photos.db` with TTL helpers (`listing-photo-ttl.ts`).

### 5.2 Dev Workflow

- `npm run dev` on port **3000**; background sync **off** in dev by default.
- Run `npm run sync:listings` locally to populate SQLite before testing Intelligence/listings.
- `GREATSCHOOLS_API_KEY` optional — live school lookups skipped when unset (console info).
- Board preview routes are **noindex** and not linked from production nav.

### 5.3 Security & Privacy

- Spotlight never renders street address or map pin on public pages.
- Owner names surfaced on expired/new-construction research pages only (not Spotlight).

---

## 6. Known Issues & Operational Notes

| Issue | Notes |
|-------|-------|
| Commit not pushed | `main` is **1 commit ahead** of `origin/main`; push required before remote CI/deploy |
| Untracked local files | `.cursor/` rules and `data/contacts.json` are **not** in commit `99e5804`; exclude from push unless intentionally added |
| Bundled DB size | `listings.bundle.db` must be present for Netlify cold starts; runtime DBs gitignored |
| Dev sync manual | Without `ENABLE_BACKGROUND_SQLITE_REFRESH=1`, dev server does not auto-sync — stale data if sync not run |
| Stale next dev lock | Multiple terminal sessions may report "Another next dev server is already running"; clear lock file or kill orphan PIDs if port 3000 blocked |
| Author metadata | Commit author shows placeholder `Your Name <your@email.com>` — consider amending before public push if desired |

---

## 7. QA Smoke Test Checklist

**Scoring & picks (additions):**

- [ ] Fresh new-construction listing (≤12 mo, first sale): condition = 100 in score breakdown
- [ ] Deal of the Day with below-median inventory: `pickMode: below-median`, excludes NC/renderings
- [ ] Deal of the Day with no below-median pool: falls back to `board-top` highest composite
- [ ] Pinned listing via `?listing=` resolves correctly

- [ ] **Dev server**: `http://localhost:3000` returns 200
- [ ] **Intelligence** (`/intelligence`): board loads; switch Grid / Large / Line; middle tier expand; vintage slider; refresh status indicator
- [ ] **Deal board preview** (`/intelligence/board-preview/option-1`): photo-led rows render (noindex)
- [ ] **Listing detail** (`/listings/[mlsId]`): all tabs navigate; comparables panel loads; If tab shows estimates; property tax modal opens
- [ ] **Spotlight** (`/spotlight`): no street address in header; no map pin; tabs mirror listing; score badge works
- [ ] **Deal of the Day** (`/deal-of-the-day`): hero, superlatives, town pills, photo deck
- [ ] **Expired listings** (`/new-construction/expired-listings`): table loads from `/api/listings/expired`
- [ ] **Lookey** (`/lookey`): viewed listings appear after visiting a detail page
- [ ] **Navigation**: Spotlight link; Expired Listings under Explore
- [ ] **APIs**: `/api/intelligence/refresh-status`, `/api/spotlight`, `/api/listings/[mlsId]/comparables` return JSON without 5xx
- [ ] **Scoring**: new-construction listing shows condition 100 in breakdown unless downgrade keywords in remarks
- [ ] **Photos**: `/api/listings/[mlsId]/photos/0` serves image from photo DB after sync

---

## 8. Business Logic — Goldilocks Algorithm

**Implementation:** `lib/goldilocks.ts`, `lib/goldilocks-score-info.ts`, `lib/board-scoring.ts`, `lib/deal-superlatives.ts`

### 8.1 Purpose

Goldilocks scores every active listing on a **0–100 composite** across six factors. The Intelligence deal board ranks listings by this score; listing detail pages show a value-score badge; Deal of the Day and Deal of the Week use the same scoring path as the board (`scoreListingsWithBoardPeers`).

Two scoring modes exist:

| Mode | Function | Disqualify filter? | Used for |
|------|----------|-------------------|----------|
| **Board scoring** | `scoreListingsForBoard` | No — all active listings scored | Intelligence deal board, Deal of the Day, Deal of the Week |
| **Qualified scoring** | `runScoring` | Yes — rejects listings that fail gates | Legacy qualified-deal flows |

### 8.2 Composite formula

Each factor scores **0–100**. The composite is a weighted sum:

| Factor | Weight | Field name |
|--------|--------|------------|
| Age | 10% | `score.age` |
| Condition | 20% | `score.condition` |
| Finishes | 25% | `score.finishesQuality` |
| PPSF fit | 25% | `score.pricePerSqftFit` |
| Layout | 10% | `score.layoutQuality` |
| Schools | 10% | `score.schoolRating` |

```
composite = age×0.10 + condition×0.20 + finishes×0.25 + ppsf×0.25 + layout×0.10 + schools×0.10
```

**Interpretation (UI copy):** ≥85 exceptional · 70–84 strong · &lt;70 qualifies with trade-offs.

### 8.3 Peer benchmarks

City-level aggregates are computed from the **peer pool** (up to `SCORE_PEER_LIMIT = 500` active listings per town, sale/rental split by `city::kind` key):

| Aggregate | Calculation |
|-----------|-------------|
| Median PPSF | Median of `price / sqft` for peer listings |
| Top PPSF 15th percentile | 85th percentile of peer PPSF values |
| Bottom PPSF 15th percentile | 15th percentile of peer PPSF values |
| Top price 15th percentile | 85th percentile of peer list prices |

School ratings resolve via GreatSchools API when `GREATSCHOOLS_API_KEY` is set; otherwise a static school-name lookup table and town baseline apply.

### 8.4 Factor scoring rules

#### Age (`scoreAge`)

| Year built | Score |
|------------|-------|
| ≥ 2015 | 92 |
| ≥ 2000 | 68 |
| ≥ 1980 | 42 |
| &lt; 1980 | 28 |
| Unknown | 50 |

#### Condition (`scoreCondition`)

- **Fresh first-sale new construction** (built within ~12 months, not a resale): **100** unless downgrade keywords or low-quality keywords appear in remarks.
- **Fresh new construction test** (`isFreshFirstSaleNewConstruction`): year built within rolling 12 months; MLS `NewConstructionType` or remark patterns confirm first sale; excludes resale language (`resale`, `previously sold`, etc.).
- **Default path:** base 50 + up to +45 from renovation keywords (`renovated`, `updated`, `new kitchen`, `gut renovation`, etc.) −12 per low-quality keyword (`carpet throughout`, `dated`, `original`) −12 per downgrade keyword (`as-is`, `fixer`, `needs tlc`, `tear down`, `mold`, etc.).

#### Finishes (`scoreFinishes`)

- Base 50 + up to +35 from quality keywords (`granite`, `hardwood`, `quartz`, `custom`, etc.).
- +8 if photo count &gt; 20; +4 more if ≥ 30.
- +5 if virtual tour present.

#### PPSF fit (`scorePpsf`)

Compares listing PPSF to city median PPSF ratio:

| Condition | Score |
|-----------|-------|
| At or above top-15% PPSF for city | 25 (overpriced band) |
| At or below bottom-15% PPSF | 30 (suspiciously cheap) |
| Ratio 0.80–0.90 of median | **100** (Goldilocks zone) |
| Ratio 0.75–0.80 | 92 |
| Ratio 0.90–1.10 | 80 − \|ratio − 0.85\| × 60 |
| Ratio &lt; 0.75 | 60 |
| Ratio &gt; 1.10 | clamped downward from 70 |

The optimal band is **80–90% of city median PPSF** — enough discount to feel like value, not so cheap that something is wrong.

#### Layout (`scoreLayout`)

- Base 50.
- Sqft per bedroom: ≥600 (+12), ≥450 (+6), &lt;300 (−8).
- ≥3 beds and ≥2 baths: +10.
- Good layout keywords (`open floor plan`, `master suite`, `finished basement`): +6 each, max +20.
- Bad layout keywords (`galley kitchen`, `small bedrooms`, `steep stairs`): −8 each.

#### Schools (`scoreSchools`)

- Average of matched elementary/middle/high ratings from static lookup table (Westport, Norwalk, etc.).
- If no school names: town baseline (e.g. Westport 92, Norwalk 70, New Canaan 94) or default 65.

### 8.5 Disqualification gates (`runScoring` only)

Listings are rejected before scoring if any gate fails:

| Reason | Rule |
|--------|------|
| `status_not_active` | Status must be Active, Coming Soon, or CS |
| `no_photos` | `photoCount` must be &gt; 0 |
| `under_min_sqft` | ≥1,200 sqft (sale) or ≥600 sqft (rental) |
| `no_price` | Price required |
| `disqualifying_keyword` | Remarks contain: cesspool, mold, as-is, handyman, needs tlc, estate condition, tear down, investor special, needs work, fixer |
| `top_price_for_town` | List price ≥ 85th percentile price for city+kind |
| `low_school_rating` | School score &lt; 65 (skipped in `cheapShortlist`) |

**Board scoring does not apply these gates** — every active listing receives a 0–100 score for ranking.

### 8.6 Intelligence deal board tiers

When sorted by score, the board splits the current page into tiers (`splitBoardByScoreTier`):

| Tier | Share of page |
|------|---------------|
| **Top** | Top 20% by score |
| **Middle** | Middle 60% (collapsible, hidden by default) |
| **Bottom** | Bottom 20% |

Tiers apply only when sort key is **score** and the page has enough listings to separate top/middle/bottom. Other sort keys show a flat list.

### 8.7 Deal superlatives (headline tags)

`deriveDealSuperlatives` produces 3–5 single-word tags for board rows and Deal of the Day hero copy. Candidates are weighted and deduplicated:

| Tag | Trigger (summary) |
|-----|-------------------|
| **Undervalued** | ≥10% below town median list price |
| **Value** | Below-median pick mode, or ≥3% discount, or PPSF fit ≥78 |
| **Fresh** | DOM ≤ 7 days |
| **Schools** | School score ≥82 |
| **Turnkey** | Condition ≥82 |
| **Renovated / Refreshed / etc.** | Finishes ≥82 **and** rehab evidence keywords in remarks |
| **Layout** | Layout score ≥82 |
| **Modern** | Age score ≥82 |
| **Reduced** | Original list price cut ≥3% |
| **Spacious** | Lot ≥0.35 acres |
| **Rare** | Composite ≥88 |

Rehab/finishes superlatives require explicit renovation language — never inferred from score alone. Fallback tags (`Curated`, `Quality`, `Top-tier`) ensure at least three tags on thin profiles.

### 8.8 Insight narrative (`buildInsight`)

Generates plain-language paragraphs for Deal of the Day / Deal of the Week:

- **Sales:** era + property type + PPSF vs city median + condition/photo narrative + composite + seller pricing advice (anchor 85–95% of median PPSF).
- **Rentals:** parallel structure with rent-per-sqft and landlord occupancy/yield advice (±5% of median rent band).

---

## 9. Business Logic — Deal of the Day

**Implementation:** `lib/deal-pick.ts`, `app/api/deal-of-the-day/route.ts`, `lib/deal-of-the-day-cache.ts`

### 9.1 Purpose

Deal of the Day surfaces **one curated pick per scope** (each TMRE town + an **All towns** aggregate). It prioritizes **established inventory below the town median price** when such listings exist; otherwise it falls back to the **highest Goldilocks composite** on the board (same 0–100 path as Intelligence).

Deal of the Week (`computeTopDeal`) is a separate, simpler pick: **always the #1 composite score** across the pool with no below-median preference.

### 9.2 Scope & inputs

| Input | Behavior |
|-------|----------|
| **Town** (`?city=`) | Single TMRE town, or omit/`all` for cross-town pool |
| **Kind** (`?kind=sale\|rental`) | Optional filter; bypasses SQLite cache when set |
| **Listing pin** (`?listing=mlsId`) | Force a specific listing through the pick pipeline |
| **Peer pool** | Up to 500 active listings per town for city medians and Goldilocks benchmarks |
| **Coverage** | Listings filtered to TMRE towns and zip coverage (`filterListingsToTmreTowns`) |

### 9.3 Selection algorithm (`computeDealOfTheDay`)

```
1. Scope listings to TMRE towns (+ optional kind filter)
2. Compute city median LIST PRICES per city::kind
3. Score all active listings via scoreListingsWithBoardPeers (same as Intelligence board)
4. Branch:
```

#### Path A — Pinned listing (`?listing=`)

If the pinned listing passes below-median value rules → return as **below-median** pick with value insight. Otherwise return as **board-top** pick with standard insight.

#### Path B — Below-median value pool (preferred)

Build **value pool** = active listings where **all** of:

- Not new construction (`isNewConstructionListing`)
- Not rendering/proposed (`isRenderingOrProposedListing` — keywords: rendering, to be built, pre-construction, under construction, etc.)
- List price **strictly below** city median for that city+kind

If value pool is non-empty:

1. Intersect with board-scored candidates
2. Rank by **valueDealRank** (see §9.4)
3. Winner → `pickMode: 'below-median'`, insight from `buildValueDealInsight`

#### Path C — Board-top fallback

If no below-median candidates exist:

1. Take highest composite from full board-scored list
2. `pickMode: 'board-top'`, insight from `buildInsight`

### 9.4 Value deal ranking (`valueDealRank`)

Used only in below-median mode:

```
valueDealRank = composite × 0.65
              + min(discountPct, 30) × 0.35
              + ppsfBonus
```

| Component | Rule |
|-----------|------|
| `discountPct` | `(1 − listPrice / cityMedianPrice) × 100`, rounded |
| `ppsfBonus` | +8 if PPSF fit ≥75; +4 if PPSF fit ≥65; else 0 |

This balances **Goldilocks quality** (65%) with **price discount vs town median** (35%), capped at 30 points discount.

### 9.5 Pick modes & response payload

| `pickMode` | Meaning |
|------------|---------|
| `below-median` | Established (non-NC, non-rendering) inventory below town median; excludes new construction by design |
| `board-top` | Highest Goldilocks composite when no below-median pool exists (or pinned listing fallback) |

Each response includes:

- Winning listing + full `ScoreBreakdown`
- `insight` (plain-language narrative)
- `superlatives` (3–5 tags from §8.7)
- `valueDiscountPct`, `cityMedianPrice`, `cityMedianPricePerSqft`
- `runnerUps` — next 3 candidates by same ranking
- Audit counts: `totalReviewed`, `qualifiedCount`, `salesReviewed`, `rentalsReviewed`

### 9.6 Caching

| Rule | Detail |
|------|--------|
| **Cache key** | `deal-of-the-day:v4:{town\|All}` in SQLite stats cache |
| **When cached** | Default request (no `kind`, no `listing` pin) after compute from DB source |
| **When bypassed** | `?kind=`, `?listing=`, or cache miss |
| **Rebuild** | `rebuildDealOfTheDayCache()` on full listings sync — one entry per town + All |
| **API cache hit** | Response includes `dealCache: true`, header `X-Deal-Cache: hit` |

### 9.7 UI integration

- Home page hero and `/deal-of-the-day` consume `/api/deal-of-the-day?city=`
- Town pills rotate scope; carousel uses `useDealOfTheDayCarousel`
- Photo deck shows thumbnails for photos 2–6 (hero is photo 1)
- Hover prefetch warms listing cache and images before navigation

### 9.8 Deal of the Day vs Deal of the Week

| | Deal of the Day | Deal of the Week |
|--|-----------------|------------------|
| Function | `computeDealOfTheDay` | `computeTopDeal` |
| Primary criterion | Below-median value pool, then composite | Highest composite only |
| Excludes NC for value path | Yes | No |
| Typical use | Daily hero, town-personalized | Weekly headline pick |

---

## 10. Out of Scope / Follow-Ups

| Item | Rationale |
|------|-----------|
| Push to GitHub / Netlify deploy | Explicitly deferred until PRD review and QA complete |
| Board preview in production nav | Internal test routes only |
| `data/contacts.json` commit | Untracked; confirm before including |
| BHHS logo in nav | `SHOW_BHHS_LOGO` remains false |
| Automated E2E test suite | Not added in this commit |
| Multi-spotlight rotation | Single `SPOTLIGHT_LISTING` config only |
| Real-time MLS push | Still polling/sync-based architecture |

---

## Appendix A — Commit Reference

```
99e5804 Expand intelligence deal board, SQLite caching, and listing platform.
```

**Co-authored-by:** Cursor

**Key new routes (sample):**

- `/spotlight`, `/spotlight/photos`, `/spotlight/comparables`, `/spotlight/if`, `/spotlight/history`
- `/listings/[mlsId]/comparables`, `/listings/[mlsId]/comparable-rentals`, `/listings/[mlsId]/if`
- `/new-construction/expired-listings`
- `/intelligence/board-preview`, `/intelligence/board-preview/option-1`

**Key new API routes:**

- `/api/intelligence/refresh-status`, `/api/intelligence/all-towns-descriptor`, `/api/intelligence/closed-listings`
- `/api/spotlight`, `/api/spotlight/comparables`
- `/api/listings/expired`, `/api/listings/[mlsId]/comparables`, `/api/listings/[mlsId]/comparable-rentals`, `/api/listings/[mlsId]/if`, `/api/listings/[mlsId]/property-taxes`, `/api/listings/[mlsId]/cache`

---

*Generated from commit `99e5804` and working tree inspection on July 5, 2026.*
