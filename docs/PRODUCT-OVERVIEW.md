# TMRE Platform — Product Overview

| Field | Value |
|-------|-------|
| **Product** | Timothy Marks Real Estate (TMRE) |
| **Domain** | Fairfield County, Connecticut market intelligence |
| **Stack** | TypeScript / Node.js 20 · Next.js 16 · React 19 · SQLite · Tailwind CSS 4 · Netlify |
| **Last major release** | Commit `99e5804` (July 5, 2026) — see [PRD-last-24-hours.md](./PRD-last-24-hours.md) |
| **Status** | Working prototype; production deploy path via Netlify |

---

## 1. Product Vision & Positioning

**TMRE** is a Fairfield County market intelligence platform built around Timothy Marks’ brokerage practice. It is not a generic MLS portal. Listings are the raw input; the product is **scored, filterable research** — a deal board, curated picks, comparables, and town-level stats — calibrated to seven core Connecticut towns.

### What TMRE is

- A **research-first** real estate site where every active listing receives a **Goldilocks composite score (0–100)** relative to current inventory in its town.
- An **agent-led intelligence layer** on top of SmartMLS data, with Timothy Marks’ positioning as an “Agent and Insight Provacateur” who combines Wall Street-style analytics with local operator experience.
- A **multi-audience** platform: buyers, sellers, investors, and contractors each get tailored copy and tools, unified by the same underlying deal model.

### Differentiation vs generic MLS sites

| Generic MLS / portal | TMRE |
|----------------------|------|
| Search by beds, baths, price | Search plus **ranking** — Intelligence deal board, tier splits, superlatives |
| Static listing cards | **Photo-led board** (Grid / Large / Line), vintage filters, live refresh status |
| Single listing page | **Tabbed research**: Overview, Photos, Comparables, Comparable Rentals, History, **If** (estimate ranges) |
| National Zestimate-style AVM | **Relative scoring** — “where to look first,” not an appraisal |
| Full address everywhere | **Spotlight** privacy mode for curated marketing listings |
| Browser-only history | **Lookey** — client-side “looked at” history across sessions |
| No agent narrative | Deal of the Day / Week with **insight prose** and **deal superlatives** |

Marketing copy on the home page describes aspirational tools (Deal Analyzer URL paste, Smart Alerts, Home Value Engine). The **implemented prototype** centers on Intelligence, listing detail research tabs, Stats, property discovery pages, and lead capture — with some homepage tools described as future-facing positioning.

---

## 2. Target Users & Personas

Personas are inferred from page copy in `app/page.tsx`, `app/about/page.tsx`, `app/investors/page.tsx`, and lead-form audience types.

### Buyers

- **Headline:** “Buy with the data sellers wish you didn't have.”
- **Needs:** List-to-sale context, block-level value drivers, scored inventory so they know where to spend showing time.
- **Primary surfaces:** Intelligence, Deal of the Day, Find, listing detail (comps, If tab), Score / Deal Model explainers.

### Sellers

- **Headline:** “Price like a pro. List like one too.”
- **Needs:** Home value context, improvement ROI framing, pricing strategy — reflected in About copy and Stats (months supply, sale-to-list).
- **Primary surfaces:** Stats, About, contact/lead capture, Spotlight (as a marketing showcase pattern).

### Investors

- **Headline:** “See the deal, not just the listing.”
- **Needs:** Yield, flip velocity, below-replacement-cost signals, multifamily pipeline — emphasized on `/investors` (partially marketing; core scoring is live on Intelligence).
- **Primary surfaces:** Intelligence, Fixer Uppers, Expired Listings, New Construction, Deal Model, Investors page.

### Agent (Timothy Marks / TMRE team)

- **Role:** Curator, explainer, and closer — not a faceless portal.
- **Needs:** Spotlight for privacy-controlled featured listings, contact capture with listing context, visitor analytics (`data/visitors.json`), co-invest narrative on Investors page.
- **Primary surfaces:** About, Spotlight config (`lib/spotlight-listing.ts`), ContactButton / LeadForm, phone CTA in nav (`6175040741`).

### Contractors (secondary persona)

- **Headline:** “Know the project before the call.”
- **Needs:** Permit/history hints, fixer inventory — partially served by Fixer Uppers and Owner History research tools.

---

## 3. Geographic Scope

### TMRE towns (full Intelligence / Stats coverage)

Defined in `lib/tmre-towns.ts`:

| Town | ZIP codes | Area nicknames |
|------|-----------|----------------|
| Norwalk | 06850–06856 | Rowayton (06853), South Norwalk (06854), Winnipauk (06855) |
| New Canaan | 06840 | — |
| Westport | 06880, 06881, 06838 | Greens Farms (06838) |
| Wilton | 06897 | — |
| Weston | 06883 | — |
| Fairfield | 06824, 06825, 06828, 06890 | Greenfield Hill (06828), Southport (06890) |
| Ridgefield | 06877, 06879 | Branchville (06879) |

### Subsets used in copy

- **Core four towns** (`TMRE_CORE_TOWNS`): Norwalk, Westport, Wilton, Fairfield — homepage Market Pulse cards and Intelligence page metadata.
- **Properties subset** (`TMRE_PROPERTIES_TOWNS`): Norwalk, Westport, Fairfield — New Construction page metadata and weekly email CTA.

### Zip boundaries & map context

- Listings are filtered by **zip + MLS city** so neighboring-town leakage is reduced (`filterListingsForTown`, `listingZipMatchesTown`).
- `ZipBoundaryPopover` visualizes town/zip boundaries on Intelligence hover.
- `TOWN_NEIGHBORS` drives adjacent-town context for map previews.
- `lib/tmre-geo.ts` provides town centroids, water/golf location premiums for comp scoring.

### Visitor location personalization

- **`/api/visitor-town`** geolocates via client IP (`ipapi.co`), maps coordinates to nearest TMRE town within **~60 miles**, returns `{ town, postal }`.
- **`VisitorLocationBadge`** in the nav shows inferred location.
- **`usePersonalizedTowns`** reorders town pills so the visitor’s nearest town appears first (Deal of the Day, Intelligence town filters).
- **`usePersistedFilter(..., preferVisitorTown=true)`** can default Intelligence town filter from visitor location when no cookie pref exists.
- Localhost / private IPs return null — no personalization in dev without mocking.

---

## 4. Platform Architecture Overview

### Technology stack & languages

TMRE is a **TypeScript-first, full-stack JavaScript** web application. There is **no Python, Ruby, PHP, or Java** in this codebase — all application logic runs on **Node.js**.

#### Languages & markup

| Language / format | Role in TMRE |
|-------------------|--------------|
| **TypeScript** | Primary language — pages, components, API routes, business logic (`lib/`), sync scripts |
| **TSX / JSX** | React components (`.tsx`) — UI for Intelligence, listings, stats, etc. |
| **CSS** | Global styles (`app/globals.css`) + **Tailwind CSS 4** utility classes |
| **SQL** | Embedded in TypeScript via **better-sqlite3** — listing cache, stats cache, photo blobs |
| **JSON** | Config, API payloads, prototype storage (`data/visitors.json`, leads) |
| **TOML / JavaScript config** | `netlify.toml`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs` |

#### Runtime, framework & UI

| Technology | Version (approx.) | Purpose |
|------------|-----------------|----------|
| **Node.js** | 20 (Netlify build/runtime) | Server runtime for Next.js, API routes, sync scripts |
| **Next.js** | 16.2.6 (App Router) | Full-stack framework — SSR, routing, API routes, instrumentation |
| **React** | 19.2.4 | UI library — client and server components |
| **react-dom** | 19.2.4 | DOM rendering |
| **Tailwind CSS** | 4.x | Design system (navy / gold / cream), responsive layout |
| **PostCSS** | via `@tailwindcss/postcss` | CSS pipeline for Tailwind |
| **Recharts** | 3.x | Stats page charts (sales trends, median price, DOM) |

#### Data layer & MLS integration

| Technology | Purpose |
|------------|---------|
| **SQLite** | Local listing cache, read snapshots, stats rows, deal-of-the-day cache |
| **better-sqlite3** | Native Node SQLite driver (WAL mode, bundled for Netlify Linux) |
| **rets-client** | SmartMLS RETS protocol — listing search, photos, history |
| **node-expat** | Native XML parser (RETS dependency) |
| **bindings** | Native addon loader (Netlify external module) |

#### Build, quality & scripts

| Tool | Purpose |
|------|---------|
| **TypeScript** | 5.x — static typing across app and scripts |
| **tsx** | Run TypeScript scripts (`scripts/sync-listings.ts`, RETS probes) with `.env.local` |
| **ESLint** | 9 + `eslint-config-next` — linting |
| **esbuild** | Netlify Functions bundler (`node_bundler` in `netlify.toml`) |

#### Deployment & ops

| Technology | Purpose |
|------------|---------|
| **Netlify** | Hosting, CI build, serverless functions |
| **@netlify/plugin-nextjs** | Next.js adapter for Netlify |
| **@netlify/functions** | Scheduled sync function (`netlify/functions/sync-listings.ts`, every 30 min) |
| **instrumentation.ts** | Next.js startup hooks — background sync, hourly stats rebuild |

#### External services (called from TypeScript, not separate languages)

| Service | Purpose | Env key |
|---------|---------|---------|
| SmartMLS **RETS** | Listings, photos, MLS history | `RETS_*` |
| **GreatSchools** API | School ratings for Goldilocks | `GREATSCHOOLS_API_KEY` |
| **OpenAI** API | Optional: finish-quality vision, All-towns descriptor copy | `OPENAI_API_KEY` |
| **Resend** | Contact form email to agent | `RESEND_API_KEY` |
| **ipapi.co** | Visitor IP → town/postal | (none) |
| **Vision Appraisal (VGSI)** | Westport owner history (HTML fetch/parse) | (none) |
| **OpenStreetMap** | Static map tile preview | `/api/map/preview` |

#### What is not used

- **Python** — not present; scoring, sync, and APIs are TypeScript on Node.js
- **Separate backend** (Django, Flask, Rails, etc.) — Next.js API routes are the backend
- **PostgreSQL / MongoDB** — SQLite only for structured cache
- **GraphQL** — REST-style JSON API routes only
- **Mobile native apps** — responsive web only

```
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js App (React 19)                       │
│  Pages: Intelligence, listings, Spotlight, discovery, research   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   API Routes         Client hooks        Static/marketing
   (/app/api/*)       (prefs, Lookey)     (About, Investors)
         │
         ├──────────────────────────────────────────┐
         ▼                  ▼                         ▼
  listings.read.db    listing-photos.db         JSON files
  (read snapshot)     (photo blobs)            leads, visitors
         ▲                  ▲
         │                  │
  listings.db (write) ◄── syncAllTownListings()
         │
         ▼
  SmartMLS RETS (rets-client)
  + optional GreatSchools API
  + ipapi.co (visitor geo)
```

### Next.js application

- **App Router** with server and client components; listing pages use `force-dynamic` where MLS data must be fresh.
- **`instrumentation.ts`** registers startup hooks: listings sync on interval (production/Netlify), stats cache rebuild (hourly), dev sync disabled unless `ENABLE_BACKGROUND_SQLITE_REFRESH=1`.
- **Native modules** (`better-sqlite3`, `rets-client`, `node-expat`) externalized in `next.config.ts` and `netlify.toml`.

### SQLite cache layer

| Database | Role |
|----------|------|
| `data/listings.db` | Primary write DB — upserts from RETS sync |
| `data/listings.read.db` | Read snapshot published after sync (`publishListingsReadSnapshot`) so API reads don’t block writes |
| `data/listing-photos.db` | Isolated photo blob store; migrated from legacy blobs on first open |
| `data/listings.bundle.db` | Shipped bundle for Netlify cold starts → copied to `/tmp/listings.db` |

Environment overrides: `LISTINGS_DB_PATH`, `LISTING_PHOTOS_DB_PATH`.

### RETS / SmartMLS

- `lib/rets.ts` lazy-loads `rets-client` and normalizes MLS records into the internal `Listing` type.
- `scripts/sync-listings.ts` / `lib/listings-sync.ts` sync **active**, **closed**, and **expired** inventory per TMRE town.
- Photo sync runs deferred after listing sync (`listing-photos-sync`).

### External APIs

| Service | Use |
|---------|-----|
| SmartMLS RETS | Listings, photos, history, owner fields |
| GreatSchools (`GREATSCHOOLS_API_KEY`) | Optional live school enrichment; static school tables in `goldilocks.ts` when unset |
| OpenAI (`OPENAI_API_KEY`) | Optional finish-quality photo analysis; Intelligence “All towns” descriptor |
| Resend (`RESEND_API_KEY`) | Contact form notifications to agent |
| ipapi.co | Visitor town/postal inference |
| Vision Appraisal (VGSI) | Westport owner history / owner lookup |
| Map preview | OpenStreetMap tiles via `/api/map/preview` |

### Deployment (Netlify)

- Build: `LISTINGS_DB_PATH=data/listings.bundle.db npm run sync:listings && npm run build`
- Runtime DB at `/tmp/listings.db`; bundled DB included in function artifacts.
- See [RELEASE-FRAMEWORK.md](./RELEASE-FRAMEWORK.md) for release lifecycle.

---

## 5. Feature Catalog by Area

### 5.1 Home Page & Deal of the Day / Week

**Routes:** `/` (home), `/deal-of-the-day`

**Home page (`app/page.tsx`)**

- **Deal of the Week hero** (`DealOfTheWeekHero`) — top composite pick via `/api/deal-of-the-week`; fallback carousel behavior in component.
- **Market Pulse** — static showcase cards for Norwalk, Westport, Wilton, Fairfield (illustrative stats, not live API on homepage).
- **Intelligence Tools** — four conceptual tools (Market Pulse, Deal Analyzer, Home Value Engine, Smart Alerts) as positioning.
- **Audiences** — Buyers, Sellers, Investors, Contractors value props.
- **Email CTA** — `LeadForm` with `source="home-cta"`.

**Deal of the Day (`/deal-of-the-day`)**

- Same hero component with `mode="day"`.
- **`/api/deal-of-the-day`** — picks one **below-median** established inventory listing (excludes new construction / renderings) using `lib/deal-pick.ts`.
- **Deal of the Week** (home) — **`board-top`** mode: highest Goldilocks composite in the qualified pool.
- UI: deal **superlatives** (3–5 words), split insight sentences, personalized **town pills**, photo thumbnail deck, score explain modal, hover cache warming (`warm-listing-cache`, `prefetch-listing-images`).

### 5.2 Intelligence (Deal Board)

**Route:** `/intelligence` (also `/intelligence/listings` for filtered list views)

**Core experience (`IntelligenceClient.tsx`)**

- **Deal board** — up to 100 listings per view, scored and sortable.
- **View modes:** Large, Grid, Line (`DealBoardViewPicker`); pref key `intel-board-view` via cookies.
- **Score tiers:** Top 20% / middle 60% / bottom 20% by composite; middle tier **collapsible** (`DealBoardMiddleTierToggle`).
- **Row metadata:** Thumbnail, Goldilocks score, superlatives, lot acres, year built (`deal-board-shared.tsx`).
- **Sorting:** Score, town, beds, baths, price, PPSF, sqft, DOM, year, status (`DealBoardSortBar`).

**Filters (persisted in cookies unless noted)**

| Filter | Pref key (sample) |
|--------|-------------------|
| Town | `tmre_intel_city` (+ visitor default) |
| Sale / rental | `tmre_tx` |
| Residential / commercial | `tmre_cls` |
| Property type (homes, multi, condos) | sale property pref |
| Min/max beds & baths | min/max bed/bath prefs |
| Price range | intel price slider indices |
| Vintage era | min/max vintage indices |
| New construction | `all` / `new` |
| Board status | all / new / reduced |

**Supporting features**

- **Vintage stats panel** (`IntelligenceVintageStats`) — bucket breakdown from `vintage-buckets` taxonomy.
- **All-towns descriptor** — POST `/api/intelligence/all-towns-descriptor` with filter context; client fallback synthesis.
- **Live sync status** — polls GET `/api/intelligence/refresh-status` for `{ refreshing, lastFinishedAt }`.
- **Closed listings** — GET `/api/intelligence/closed-listings` for sold inventory in filters.
- **Snapshot cache** — client-side filter snapshot cache (`intelligence-snapshot-cache.ts`) with collapse toggle.
- **Board preview (internal)** — `/intelligence/board-preview`, `/intelligence/board-preview/option-1` (noindex, not in nav).

### 5.3 Listing Detail

**Routes:** `/listings/[mlsId]` and tab paths

| Tab | Path | Purpose |
|-----|------|---------|
| Overview | `/listings/[mlsId]` | Hero panels, sidebar, schools, property tax modal, value score badge |
| Photos | `/listings/[mlsId]/photos` | Gallery, thumb grid, priority loading |
| Comparables | `/listings/[mlsId]/comparables` | Scored sale comps via `/api/listings/[mlsId]/comparables` |
| Comparable Rentals | `/listings/[mlsId]/comparable-rentals` | Rental comp panel + API |
| History | `/listings/[mlsId]/history` | Listing history timeline (`ListingHistoryClient`) |
| If | `/listings/[mlsId]/if` | Weighted comp-based sale/rent **estimate ranges** (`listing-if-estimates.ts`) |

**Shared shell:** `ListingHeroPanels`, `ListingHeader`, `ListingSidebar`, `ListingSubnav`, `ListingOverviewPanels`.

**Additional capabilities**

- **Value score badge** — click opens Goldilocks breakdown modal.
- **Property tax history** — `/api/listings/[mlsId]/property-taxes`; modal in details panel.
- **Lookey recording** — `useRecordLookedAtListing` on load.
- **Photo obfuscation** — `ListingPhotoObfuscation` when configured.
- **Cache warm** — POST `/api/listings/[mlsId]/cache` for hover/navigation prefetch.
- **Photos served from** `listing-photos.db` via `/api/listings/[mlsId]/photos/[index]`.

### 5.4 Spotlight (Privacy-Mode Featured Listing)

**Routes:** `/spotlight`, `/spotlight/photos`, `/spotlight/history`, `/spotlight/comparables`, `/spotlight/comparable-rentals`, `/spotlight/if`

- **Config:** `SPOTLIGHT_LISTING` in `lib/spotlight-listing.ts` — single featured property; MLS-backed when `mlsId` set.
- **Fixed URLs** — no MLS id in public path (marketing privacy).
- **Privacy mode:** Hides street address, status, DOM; map pin hidden; shows `displayTitle` + town-level location only (`SpotlightPageChrome`, `variant="spotlight"`).
- **APIs:** GET `/api/spotlight`, `/api/spotlight/comparables`.
- **Redirect:** `/spotlight.html` → `/spotlight` (permanent).

### 5.5 Property Discovery

| Page | Route | Description |
|------|-------|-------------|
| **New Construction** | `/new-construction` | Live new-build inventory; owner lookup; supply metrics via `/api/listings/new-construction` |
| **Expired Listings** | `/new-construction/expired-listings` | MLS expired 30+ days; `/api/listings/expired` with owner enrichment |
| **Fixer Uppers** | `/fixer-uppers` | Handyman specials, teardowns, buildable lots — keyword/heuristic filters (`fixer-listings.ts`) |
| **Find** | `/find` | Search by address, street, MLS #, zip — `/api/listings/find` |

### 5.6 Research

| Page | Route | Description |
|------|-------|-------------|
| **Stats** | `/stats` | Market statistics — median price, DOM, PPSF, months supply, sales-by-month/price/vintage charts; hourly SQLite stats cache |
| **Score** | `/score` | Public explainer for Goldilocks model, six factors, score tiers |
| **Owner History** | `/owner-history` | Westport-focused owner research from public records API |
| **Deal Model** | `/deal-model` | Methodology narrative (not in main nav; linked from Score page) |

### 5.7 Lookey (Looked-At Listings)

**Route:** `/lookey` — nav label **“Looked at…”**

- Client-side storage in **`localStorage`** (`looked-at-listings.ts`); migrates legacy cookie on first read.
- Populated when user views listing detail pages.
- `LookeyClient` displays browsing history with links back to listings.

### 5.8 Investors & About

**Investors (`/investors`)**

- Marketing page: live deal scoring, multifamily pipeline, flip velocity, below-replacement-cost alerts.
- Norwalk vs Westport comparison sidebar (illustrative 90-day metrics).
- Co-invest CTA section with link to New Construction.

**About (`/about`)**

- Founder story (Timothy Marks — BHHS NE, Westport resident, Wall Street + principal investor background).
- Values: AI-native, human touch, radical transparency, three markets (Fairfield County, Massachusetts, South Florida).
- Profile photo opens contact trigger.

### 5.9 Contact & Lead Capture

- **`ContactButton`** — opens slide-over with `ContactFormPanel`.
- **Validation** — name, US phone, email; simple math captcha.
- **POST `/api/contact`** — general inquiries.
- **POST `/api/leads`** — structured leads with audience type (`buyer`, `seller`, `investor`, `contractor`), zip, source; attaches to visitor cookie `tmre_vid`.
- **`LeadForm`** on homepage — weekly brief signup.
- **Visitor logging** — POST `/api/visitor/log`; storage in `data/visitors.json`.

### 5.10 Goldilocks Scoring Model

Implemented in `lib/goldilocks.ts`, explained in `lib/goldilocks-score-info.ts` and `app/score/page.tsx`.

#### Six weighted dimensions

| Factor | Weight | What it measures |
|--------|--------|------------------|
| Age | 10% | Year built — newer construction scores higher |
| Condition | 20% | Move-in readiness from remarks; **fresh first-sale new construction → 100** unless downgrade keywords |
| Finishes | 25% | Quality keywords, photo depth, virtual tour |
| PPSF fit | 25% | Price-per-sqft vs city median “Goldilocks zone” |
| Layout | 10% | Bed/bath mix, sqft per bed, layout keywords |
| Schools | 10% | Named school ratings or town baseline |

**Composite:** Weighted sum, 0–100, **calibrated per city** against active peer inventory (`SCORE_PEER_LIMIT = 500`).

#### Disqualification gates

Listings can be excluded from deal picks with reasons: inactive status, no photos, under min sqft (1200 sale / 600 rental), no price, disqualifying keywords (fixer, mold, tear down, etc.), top 15% price for town, low school rating (&lt;65).

#### Score tiers (UI)

| Range | Label | Meaning |
|-------|-------|---------|
| 85–100 | Top pick | Exceptional — act fast |
| 70–84 | Strong | Worth close look |
| 0–69 | Watch | In market but not standing out |

#### Deal superlatives (`lib/deal-superlatives.ts`)

3–5 single-word tags derived from score dimensions and listing signals:

- Examples: **Undervalued**, **Value**, **Fresh**, **Schools**, **Turnkey**, **Renovated/Modernized** (rehab words require evidence in remarks), **Layout**, **Modern**, **Reduced**, **Spacious**, **Rare**, **Curated**, **Top-tier**.
- Used on Intelligence board rows, Deal of the Day/Week hero, and related cards.

#### Deal pick modes (`lib/deal-pick.ts`)

| Mode | Used by | Selection logic |
|------|---------|-----------------|
| `below-median` | Deal of the Day | Below town median price; excludes new construction/renderings; value-ranked |
| `board-top` | Deal of the Week | Highest composite among qualified active listings |

---

## 6. Key User Journeys

### Journey 1: Discover today’s value pick

1. Land on **home** or open **Deal of the Day** from nav.
2. Hero loads pick from `/api/deal-of-the-day` with insight text and superlatives.
3. User switches **town pill** (personalized order via visitor location).
4. Clicks through to **listing detail**; photos prefetch on hover.
5. Opens **Score breakdown** modal or **If** tab for estimate range.
6. Optionally submits **contact form** with listing context.

### Journey 2: Research the market on Intelligence

1. Navigate to **Intelligence** (bolt icon in nav).
2. Town filter defaults from cookie or visitor location; adjust sale/rental, price, vintage, beds.
3. Scan **tiered deal board** in Grid view; expand middle tier if collapsed.
4. Sort by score or DOM; open **vintage stats** and **all-towns descriptor**.
5. Click row → listing detail **Comparables** tab.
6. Note **refresh status** indicator while background sync runs.

### Journey 3: Browse and revisit listings (Lookey)

1. User explores via **Find** or Intelligence.
2. Each listing detail view **records to Lookey** automatically.
3. Later, open **“Looked at…”** in nav.
4. Return to any prior listing from local history.

### Journey 4: Investigate distressed / expired inventory

1. Open **Explore → Expired Listings** or **Fixer Uppers**.
2. Table loads from SQLite-backed APIs with **owner name** where available.
3. Cross-reference **Owner History** or listing **History** tab.
4. Contact agent via nav **Contact** or phone.

### Journey 5: Agent showcases a coming-soon property (Spotlight)

1. Agent sets `SPOTLIGHT_LISTING` in config (MLS id, display title, town).
2. Public user opens **Spotlight** — sees marketing title, photos, scores, comps tabs **without street address or map pin**.
3. User reviews **If** estimates and comparables under privacy rules.
4. Submits contact form; internal records retain full address from config.

---

## 7. Data Sources & Integrations

| Source | Data provided | Integration point | Required |
|--------|---------------|-------------------|----------|
| **SmartMLS RETS** | Active/closed/expired listings, photos, taxes, schools fields, history | `lib/rets.ts`, `listings-sync.ts`, API routes | Yes (credentials in `.env.local`) |
| **SQLite (`listings.db`)** | Cached listing rows, sync metadata, stats cache rows | `lib/listings-db.ts`, all read APIs | Yes |
| **SQLite (`listing-photos.db`)** | Photo blobs | `lib/listing-photos-db.ts`, photo routes | Yes (after sync) |
| **GreatSchools API** | Live school ratings | `lib/greatschools.ts` | No — falls back to static tables |
| **OpenAI API** | Finish-quality vision; All-towns market descriptor | `lib/finish-quality.ts`, `lib/intelligence-all-towns-descriptor.ts` | No — features skip or use fallback copy |
| **Resend** | Contact form email delivery | `lib/contact-notify.ts`, `/api/contact` | No — form may fail silently without key |
| **ipapi.co** | IP → lat/lon/postal | `/api/visitor-town` | No — degrades gracefully |
| **Vision Appraisal (VGSI)** | Westport owner/sales records | `lib/vision-appraisal.ts`, `/api/owner-history` | Partial — Westport-focused UI |
| **OpenStreetMap** | Map tile preview on listing pages | `/api/map/preview` | Yes (public tiles) |
| **Local JSON files** | Leads, visitors | `data/leads.json`, `data/visitors.json` | Dev/prototype storage |
| **Bundled DB** | Netlify cold-start seed | `data/listings.bundle.db` | Production deploy |

---

## 8. Personalization & Persistence

### Cookie preferences (`lib/client-prefs.ts`)

Most Intelligence and Deal filters use **cookies** (1-year max-age, `SameSite=Lax`):

- Town, transaction type, class, beds/baths, price indices, vintage range, new construction filter, sort key/direction, board view (`intel-board-view`), stats panel expanded towns (`tmre_intel_stats_expanded_towns`), Deal of the Day town scope.

### localStorage

- **Lookey** looked-at listings (`looked-at-listings.ts`).
- Intelligence board view pref is stored via **cookies** (`usePersistedFilter`), not localStorage — despite older docs referencing localStorage for `intel-board-view`.

### Visitor identity

- Cookie **`tmre_vid`** — anonymous visitor id for logging and lead attachment.

### Server-side

- No user accounts; personalization is **browser-local + IP geolocation**.

---

## 9. Current Prototype Maturity

### Production-ready (with ops caveats)

| Area | Notes |
|------|-------|
| Intelligence deal board | Full filter/sort/tier UX; live SQLite reads |
| Listing detail tabs | Overview through If; comps and tax modals |
| Deal of the Day / Week | Scored picks with API backing |
| SQLite sync architecture | Read/write split, photo DB, Netlify bundle path |
| Stats cache | Hourly rebuild in production |
| Spotlight privacy mode | Config-driven single listing |
| Navigation & contact | Functional forms with captcha |
| Scoring pipeline | Goldilocks + superlatives integrated across surfaces |

### Experimental / internal

| Area | Notes |
|------|-------|
| Board preview routes | noindex test layouts |
| Homepage Market Pulse stats | Static marketing numbers, not live API |
| Investors page metrics | Illustrative comparison table |
| Deal Analyzer / Smart Alerts (homepage) | Positioning only — not implemented as pages |
| BHHS logo in nav | `SHOW_BHHS_LOGO = false` |
| Automated E2E tests | Not present |
| Multi-spotlight rotation | Single config entry only |

### Operational requirements

- **Dev:** Run `npm run sync:listings` before testing Intelligence/listings; background sync off by default.
- **Deploy:** Requires `listings.bundle.db`; push commit before Netlify CI.
- **Secrets:** RETS credentials required; GreatSchools optional.

For release-specific breaking changes, QA checklist, and deployment steps, see [RELEASE-FRAMEWORK.md](./RELEASE-FRAMEWORK.md) and [PRD-last-24-hours.md](./PRD-last-24-hours.md).

---

*Document reverse-engineered from the TMRE prototype codebase, commit `99e5804`, July 5, 2026.*
