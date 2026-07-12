# Database — Neon Postgres migration (Phase 1)

This directory holds the Postgres schema that replaces the SQLite-on-Netlify-Blobs
listings store. Phase 1 is **schema + migration SQL only** — no application code has
been switched over yet (that begins in Phase 2: swapping the `lib/listings-db.ts`
connection layer).

## Why this migration exists

SQLite is a single file. On Netlify every request can hit a brand-new, disposable
Lambda with its own tiny (512 MB) `/tmp` disk, so the file has to be downloaded from
Netlify Blobs, mutated, and re-uploaded on every sync. That file-shuttling is the
root of every production bug we chased: cold-start restore failures, ENOSPC crashes,
WAL-ordering data loss, and Lambdas racing to overwrite each other's uploads.

Hosted Postgres (Neon) removes the file entirely: one always-on database that every
Lambda reaches over a network connection, exactly like a REST call. No local copy on
any Lambda, so that whole class of "did my copy sync correctly" bugs disappears
structurally rather than by another patch.

## Schema design

### Typed columns + `data jsonb` + `raw jsonb`

The `listings` table mirrors the SQLite approach but promotes far more fields to real
typed columns:

- **Typed, indexed columns** for everything the app filters, sorts, range-compares,
  or groups on — `town`, `status_bucket`, `price`, `beds`, `baths`, `sqft`,
  `lot_acres`, `year_built`, `dom`, `postal_code`, `close_date`, `close_price`,
  `latitude`/`longitude`, and the timestamps. These let the comparables match
  (beds ±1, baths ±1, lot ±40%, vintage bucket, zip equality) and the stats/scoring
  date windows run **in SQL** instead of loading everything into memory first.
- **`data jsonb`** — the normalized `Listing` object *without* `raw`. This is the
  hydration source: on read the app spreads `data` (plus `raw`) back into a `Listing`,
  exactly like `parseListingRow()` does today with the SQLite `data` TEXT column.
- **`raw jsonb`** — the full RETS record. This is the catch-all so a new MLS field
  never forces a schema migration; it is also the target for optional GIN indexing
  later.

### Indexing strategy (typed columns + B-tree, GIN deferred)

Every current query is a range, equality, sort, or group operation — all served by
**B-tree** indexes:

| Index | Serves |
|-------|--------|
| `idx_listings_town_status` | town pool filter |
| `idx_listings_status_modts` | recent-updates feed (`ORDER BY modification_timestamp DESC`) |
| `idx_listings_town_price` | deal-board pool sort (`ORDER BY price DESC`) |
| `idx_listings_comps` | comparables lookup (`postal_code` equality → `beds`/`baths` range) |
| `idx_listings_close_date` | closed-inventory date windows (2024+, 8-month, 7-day) |
| `idx_listings_year_built` | sales-by-vintage grouping |

**GIN is intentionally not enabled** on `raw` or `data`. GIN accelerates containment
(`@>`) and full-text membership, which none of the current comparables/stats/scoring
queries use. Adding GIN now would only add write cost. The commented "FUTURE" block at
the bottom of `0001_init.sql` shows exactly how to add:

- a GIN index on `raw` if/when a `raw @> '{...}'` containment query appears,
- a `tsvector` generated column + GIN for full-text search over public remarks,
- PostGIS + GiST if radius/geo search is ever wanted (lat/long are already stored).

### Out of scope

- **Photos** stay in their existing binary store (Netlify Blobs / the
  `listing-photos` cache). Binary blobs do not belong in Postgres — no
  `listing_photos` table is created here.

## Provisioning Neon (your action)

You can use **Netlify DB** (Neon under the hood, wired into the Netlify dashboard) or
a **standalone Neon project**. Either works; Netlify DB is the least setup since it
injects the connection env vars automatically.

### Option A — Netlify DB (recommended, since the site is already on Netlify)

1. In the Netlify dashboard for `tmrebuilder.com`: **Extensions → Netlify DB** (or
   **Add-ons → Database**) and provision a database. This creates a Neon project and
   sets `NETLIFY_DATABASE_URL` (pooled) and `NETLIFY_DATABASE_URL_UNPOOLED`
   (direct) on the site's environment automatically.
2. Pull them locally so you can run the migration:
   ```
   netlify env:get NETLIFY_DATABASE_URL_UNPOOLED
   ```

### Option B — standalone Neon

1. Create a project at https://console.neon.tech (choose a region close to your
   Netlify functions region).
2. Copy the connection string from the Neon dashboard. Neon gives you a **pooled**
   host (`...-pooler...`) for the app and a **direct** host for migrations/DDL.
3. Set env vars locally (`.env.local`) and on Netlify:
   ```
   DATABASE_URL=postgresql://<user>:<pass>@<host>-pooler.../<db>?sslmode=require
   DATABASE_URL_UNPOOLED=postgresql://<user>:<pass>@<host>.../<db>?sslmode=require
   ```

> Use the **unpooled / direct** connection for running migrations (DDL), and the
> **pooled** connection for the app's normal queries. Phase 2 will read these.

## Running the migration

Use the **direct/unpooled** connection string. Any of these work:

**psql:**
```
psql "$DATABASE_URL_UNPOOLED" -f db/migrations/0001_init.sql
```

**Neon SQL Editor:** paste the contents of `db/migrations/0001_init.sql` and run.

**Netlify DB (unpooled):**
```
psql "$NETLIFY_DATABASE_URL_UNPOOLED" -f db/migrations/0001_init.sql
```

The script is idempotent (all `CREATE ... IF NOT EXISTS`, wrapped in a transaction)
and records itself in the `schema_migrations` table, so re-running is safe.

## Verifying

```sql
-- tables present
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- indexes on listings
SELECT indexname FROM pg_indexes
WHERE tablename = 'listings' ORDER BY indexname;

-- migration recorded
SELECT * FROM schema_migrations;
```

## Next phases (not in this PR)

- **Phase 2** — swap `lib/listings-db.ts`'s `better-sqlite3` layer for a Postgres
  client (`pg` or Neon's serverless driver), reading the env vars above.
- **Phase 3** — rewrite the sync layer (`lib/listings-sync.ts`,
  `lib/listings-db-persist.ts`): RETS → Postgres upserts via
  `INSERT ... ON CONFLICT DO UPDATE`, and delete the blob-checkpoint / WAL /
  chunked-finalize machinery.
- **Phases 4–6** — convert dependent libs from synchronous `better-sqlite3` calls to
  async Postgres queries, update API routes + admin UI, then test end-to-end and cut
  over.
