# TMRE Release Framework

| Field | Value |
|-------|-------|
| **Purpose** | Reusable process for shipping TMRE prototype releases |
| **Companion docs** | [PRODUCT-OVERVIEW.md](./PRODUCT-OVERVIEW.md), [PRD-last-24-hours.md](./PRD-last-24-hours.md) |
| **Current baseline** | Release **v2026.07.05** — commit `99e5804` |

---

## 1. Release Philosophy

TMRE development follows a **prototype-driven, docs-reverse-engineered** model:

1. **Ship working software first** — features land in the Next.js app and SQLite layer; requirements are inferred from the running prototype rather than written upfront.
2. **Document after merge** — each significant release produces a **PRD delta** (what changed, acceptance criteria, QA checklist) and updates to the **product overview** when scope shifts.
3. **Small, verifiable slices** — Intelligence, listing detail, and sync infrastructure evolve together; releases are tagged by date when semver adds little value for a single-operator site.
4. **Production path is explicit** — Netlify build, bundled SQLite, and sync scripts are part of the release definition, not an afterthought.

This framework keeps stakeholder communication (changelog, QA, deploy notes) consistent even when implementation leads documentation.

---

## 2. Release Naming & Versioning

### Recommended scheme: **date-based primary + optional semver**

| Label | Format | Example | When to use |
|-------|--------|---------|-------------|
| **Release ID** | `vYYYY.MM.DD` | `v2026.07.05` | Human-facing release notes, Netlify deploy tags |
| **Git tag** | `v2026.07.05` or `release/2026-07-05` | Same | Annotated tag on merge commit |
| **package.json** | Semver bump optional | `0.2.0` | Only if publishing or external consumers appear |

**Rationale:** TMRE is a private brokerage prototype with continuous MLS sync behavior. Date releases map cleanly to “what shipped this week.” Semver (`MAJOR.MINOR.PATCH`) can supplement when breaking API or DB migrations occur:

- **MAJOR** — SQLite schema break, removed routes, env var renames requiring action.
- **MINOR** — New product areas (Spotlight, Expired Listings).
- **PATCH** — Scoring tweaks, UI fixes, copy.

For release `v2026.07.05`, treat it as **Release 1.0** of the intelligence platform expansion (first documented platform release).

---

## 3. Release Lifecycle

```
┌─────────────┐    ┌──────────────┐    ┌─────────┐    ┌──────┐    ┌─────────────────┐
│ Local dev   │───▶│ QA smoke     │───▶│ Commit  │───▶│ Push │───▶│ Netlify deploy  │
│ + sync      │    │ (checklist)  │    │ + tag   │    │ main │    │ build + verify  │
└─────────────┘    └──────────────┘    └─────────┘    └──────┘    └─────────────────┘
```

### Stage 1 — Local development

| Step | Action |
|------|--------|
| Start dev server | `npm run dev` (port 3000) |
| Populate SQLite | `npm run sync:listings` (required — background sync **off** in dev by default) |
| Optional live sync | `ENABLE_BACKGROUND_SQLITE_REFRESH=1 npm run dev` |
| Env | `.env.local` with RETS credentials; optional `GREATSCHOOLS_API_KEY` |
| Lint | `npm run lint` |

### Stage 2 — QA smoke

Run the condensed checklist in [Section 6](#6-release-100--v20260705) (or full list in [PRD-last-24-hours.md §7](./PRD-last-24-hours.md)). Block release on 5xx errors on critical APIs or broken Intelligence/listing flows.

### Stage 3 — Commit

- Single descriptive commit or squash merge on `main`.
- Message format: **imperative summary** + optional body listing major areas.
- Example: `Expand intelligence deal board, SQLite caching, and listing platform.`
- Co-authored-by lines acceptable for agent-assisted work.

### Stage 4 — Push

- Push `main` to `origin` (required before remote CI/deploy).
- Verify no accidental secrets (`data/contacts.json`, `.env`) in commit.

### Stage 5 — Netlify deploy

- Build command (from `netlify.toml`):

  ```bash
  LISTINGS_DB_PATH=data/listings.bundle.db npm run sync:listings && npm run build
  ```

- Confirm `data/listings.bundle.db` present in repo artifact (or build pipeline).
- Post-deploy: hit `/intelligence`, `/api/intelligence/refresh-status`, `/spotlight`.
- Cold start: instrumentation warms empty `/tmp` SQLite from bundle (~8s delay).

---

## 4. Release Artifact Checklist

Produce or update these artifacts **every release**:

| Artifact | Owner | Location | Contents |
|----------|-------|----------|----------|
| **PRD delta** | Dev / PM | `docs/PRD-last-24-hours.md` or dated PRD file | Requirements by area, acceptance criteria, known issues |
| **Product overview update** | Dev / PM | `docs/PRODUCT-OVERVIEW.md` | New routes, features, maturity notes if scope changed |
| **Release framework entry** | Dev | `docs/RELEASE-FRAMEWORK.md` §6 + release log table | Summary, changelog, breaking changes, QA |
| **QA checklist** | QA / Dev | PRD §7 or release section | Smoke tests executed (checkboxes) |
| **Commit message** | Dev | Git | Imperative, reflects *why* not just file list |
| **Deploy notes** | Dev | Release section or PR | Netlify env, bundle DB, migration steps |
| **Git tag** (optional) | Dev | `vYYYY.MM.DD` | Points at release commit |

### Commit message standards

- **Subject:** ≤72 chars, imperative mood (“Add Spotlight privacy mode” not “Added”).
- **Body:** Bullet major product areas; mention breaking changes and migrations.
- **Avoid:** WIP commits on main; placeholder author email before public push.

---

## 5. Release Log Template

Copy for future releases:

| Field | Value |
|-------|-------|
| **Release** | vYYYY.MM.DD |
| **Date** | |
| **Commit** | |
| **Author** | |
| **Summary** | One paragraph for stakeholders |
| **Scope** | N files changed (+/− lines) |
| **Features** | Bullets by product area |
| **Breaking changes** | Migrations, env vars, workflow |
| **Deploy** | Netlify/build notes |
| **QA** | Pass/fail + link to checklist |
| **Known issues** | |
| **Deferred** | |

### Historical log

| Release | Date | Commit | Summary |
|---------|------|--------|---------|
| **v2026.07.05** (1.0) | Jul 5, 2026 | `99e5804` | Intelligence platform expansion — deal board, SQLite caching, listing tabs, Spotlight |
| *vYYYY.MM.DD* | | | *Next release* |

---

## 6. Release 1.0 / v2026.07.05

Documented from commit **`99e5804`** — *Expand intelligence deal board, SQLite caching, and listing platform.* Full requirement IDs live in [PRD-last-24-hours.md](./PRD-last-24-hours.md).

### Release summary

This release transforms TMRE from a listings browser into a **research platform**: photo-led Intelligence deal board, dual SQLite read layer, rich listing detail tabs, privacy-mode Spotlight, expired listings, Lookey persistence, and hourly stats cache. Goldilocks scoring assigns **condition 100** to fresh first-sale new construction unless downgrade keywords appear in remarks.

**Status at documentation time:** Local commit on `main`; ahead of `origin/main` until pushed.

### Scope

| Metric | Value |
|--------|-------|
| Files changed | **165** |
| Lines added | +17,364 |
| Lines removed | −2,183 |
| Co-authored | Cursor |

### Feature changelog by area

Summarized for stakeholders — see PRD §3 for requirement IDs.

| Area | What shipped |
|------|----------------|
| **Intelligence** | Grid / Large / Line board views; score tiers (top/middle/bottom); sort bar; vintage filter + stats; all-towns descriptor API; refresh status polling; closed listings API; internal board preview routes |
| **SQLite** | Write DB + read snapshot (`listings.read.db`); separate `listing-photos.db`; refresh depth tracking; listing cache warm API; hourly stats rebuild via `instrumentation.ts`; bundled DB for serverless |
| **Listing detail** | Tabs: Overview, Photos, Comparables, Comparable Rentals, History, If; property tax modal; value score badge; Lookey hook; photo obfuscation support |
| **Spotlight** | Fixed URLs without MLS id; privacy header/map; shared listing layout; `/api/spotlight` + comparables |
| **Deal of the Day** | Superlatives, town pills, photo deck, cache prefetch on hover |
| **Scoring** | New-construction condition 100 rule; rehab superlatives require remark evidence |
| **Discovery** | Expired listings page + API; new construction refresh; fixer/find client updates |
| **Research** | Stats cache alignment; sales-by-month API updates |
| **Navigation** | Spotlight link; Expired Listings under Explore; contact/zip boundary polish |
| **Deploy** | Netlify build runs sync against bundle; native modules externalized |

### Breaking changes / migrations

| Change | Impact | Action required |
|--------|--------|-----------------|
| **SQLite read/write split** | APIs read `listings.read.db`; sync writes `listings.db` then publishes snapshot | Run full `sync:listings` after deploy; ensure read snapshot exists |
| **Photo DB split** | Blobs in `listing-photos.db`, not main DB | First open migrates legacy blobs; allow photo warm after sync |
| **Dev workflow** | Background sync **disabled** in dev unless `ENABLE_BACKGROUND_SQLITE_REFRESH=1` | Developers must run `npm run sync:listings` manually |
| **Bundled DB path** | Netlify uses `data/listings.bundle.db` → `/tmp/listings.db` | Ship updated bundle with release; set `LISTINGS_DB_PATH` in build |
| **Runtime DB gitignore** | `listings.db`, `listings.read.db`, etc. not committed | Only bundle + JSON data files in repo |

No user-facing URL breaks for existing marketing pages; new routes are additive.

### Deployment notes

**Netlify (`netlify.toml`)**

```toml
[build]
  command = "LISTINGS_DB_PATH=data/listings.bundle.db npm run sync:listings && npm run build"

[build.environment]
  NODE_VERSION = "20"
  LISTINGS_DB_PATH = "/tmp/listings.db"
```

**Function artifacts:** Include `better-sqlite3`, `rets-client`, `node-expat`, `bindings`, and `data/listings.bundle.db`.

**Instrumentation (production)**

- Listings sync on interval when `LISTINGS_SYNC_INTERVAL_MS` ≥ 60_000.
- Stats refresh on `STATS_CACHE_REFRESH_MS` (default 1 hour).
- Cold Netlify start: sync if `/tmp` cache empty (~8s delay).

**Pre-push checklist**

- [ ] Commit `99e5804` (or successor) pushed to GitHub
- [ ] `listings.bundle.db` current enough for smoke test
- [ ] RETS credentials in Netlify env (not in repo)
- [ ] Exclude untracked `data/contacts.json` unless intentional

### QA checklist (condensed)

- [ ] `http://localhost:3000` returns 200
- [ ] **Intelligence** — board loads; Grid / Large / Line; middle tier expand; vintage slider; refresh indicator
- [ ] **Listing detail** — all tabs; comparables; If estimates; property tax modal
- [ ] **Spotlight** — no street address; no map pin; tabs work; score badge
- [ ] **Deal of the Day** — hero, superlatives, town pills, photo deck
- [ ] **Expired listings** — table from `/api/listings/expired`
- [ ] **Lookey** — viewed listings appear after detail visit
- [ ] **Navigation** — Spotlight; Expired under Explore
- [ ] **APIs** — `refresh-status`, `spotlight`, `comparables` return JSON without 5xx
- [ ] **Scoring** — new construction shows condition 100 unless downgrade keywords
- [ ] **Photos** — `/api/listings/[mlsId]/photos/0` serves from photo DB after sync

Full checklist: [PRD-last-24-hours.md §7](./PRD-last-24-hours.md).

### Known issues & deferred items

| Item | Notes |
|------|-------|
| Commit not pushed | `main` ahead of `origin` until push |
| Placeholder git author | `Your Name <your@email.com>` on `99e5804` — amend before public push if desired |
| Untracked files | `.cursor/` rules, `data/contacts.json` not in release commit |
| Dev stale data | Without manual sync, Intelligence shows stale SQLite |
| Dev server lock | Multiple `next dev` sessions may block port 3000 |
| No E2E suite | Manual smoke only |
| Single Spotlight | No rotation — edit `SPOTLIGHT_LISTING` config |
| BHHS nav logo | Disabled (`SHOW_BHHS_LOGO = false`) |
| Real-time MLS push | Polling/sync architecture only |

---

## 7. Future Release Planning Template

Organize backlog by **product area** aligned to [PRODUCT-OVERVIEW.md §5](./PRODUCT-OVERVIEW.md):

| Category | Example epics | Priority (RICE / gut) | Target release |
|----------|---------------|----------------------|----------------|
| **Intelligence** | Closed deal tier on board, saved filter presets, email board digest | | |
| **Listing detail** | PDF export, share link, school GreatSchools live overlay | | |
| **Spotlight** | Multi-listing rotation, agent CMS | | |
| **Discovery** | Map search, draw polygon, saved searches | | |
| **Research** | Live homepage Market Pulse, investor dashboard wiring | | |
| **Scoring** | Rent-specific weights, commercial scoring v2 | | |
| **Platform** | E2E tests, staging env, auth for admin APIs | | |
| **Growth** | Weekly email automation, CRM sync | | |

### Sprint-ready story template

```
Title: [Area] Short imperative title
User: Buyer | Seller | Investor | Agent
Problem: ...
Acceptance:
  - [ ] ...
  - [ ] API returns ...
Docs: Update PRODUCT-OVERVIEW §X if user-facing
QA: Add row to release checklist
```

---

## 8. Definition of Done (Release)

A TMRE release is **Done** when all of the following are true:

### Code & data

- [ ] Changes merged to `main` (or release branch merged to `main`)
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds locally
- [ ] `npm run sync:listings` completes against RETS (or bundle updated intentionally)
- [ ] No secrets committed; `.env.local` unchanged in git

### Quality

- [ ] QA smoke checklist executed; failures documented or fixed
- [ ] No P0 bugs on Intelligence, listing detail, or Deal of the Day
- [ ] Critical APIs return 200/JSON: `refresh-status`, listing detail, spotlight

### Documentation

- [ ] PRD delta written or updated for the release window
- [ ] PRODUCT-OVERVIEW updated if new user-facing features or routes
- [ ] RELEASE-FRAMEWORK release log row added (§5 table + §6-style section for major releases)

### Deploy

- [ ] Pushed to remote; Netlify build green
- [ ] Post-deploy smoke on production URL
- [ ] `listings.bundle.db` verified for cold-start path
- [ ] Stakeholder summary communicated (email/Slack) with link to PRD + release section

### Optional

- [ ] Git tag `vYYYY.MM.DD` created
- [ ] Semver bump in `package.json` if adopting semver track

---

*Release framework established July 5, 2026, baseline commit `99e5804`.*
