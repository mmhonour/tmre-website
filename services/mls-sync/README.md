# mls-sync (Railway)

Always-on service: **SmartMLS RETS → Neon**. Netlify is **not** in the pull path.

**Morning cutover canvas (step checklist):** open
`railway-mls-sync-setup.canvas.tsx` beside chat (Cursor canvases folder).

## What it does

- Every ~30 minutes (or `MLS_SYNC_INTERVAL_MS`): Incremental pull + upsert
- `POST /run` (Bearer `SYNC_CRON_SECRET`): Admin **Sync now**
- `GET /health`: process + Neon End/Start/heartbeat for peace of mind
- Stamps `last_incremental_sync` / `last_mls_sync_heartbeat` in Neon

## Deploy (cheapest path — demain matin)

### 0. Code on GitHub

Push the mls-sync cutover to the branch Railway will deploy (usually `main`)
before creating the project. Root [`railway.toml`](../../railway.toml) +
[`nixpacks.toml`](../../nixpacks.toml) must be present (`startCommand = npm run
start:mls-sync`, healthcheck `/health`, **Node 20** + python/g++ for
`node-expat` native build). `npm ci` runs only in the Nixpacks **install**
phase — never again as `buildCommand` (that causes EBUSY on
`node_modules/.cache`). If the build fails on Node 18 / Python / EBUSY,
redeploy after those files are on `main`.

### 1. Railway project

1. [railway.app](https://railway.app) → New Project → **Deploy from GitHub** → `tmre-website`.
2. Prefer **Add variables** before the first deploy (service starts a pull on boot).
3. Use a plan that keeps the process **always on** (sleeping free tiers break Incremental).

### 2. Railway variables (copy from Netlify / Neon)

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon pooled — same as production site |
| `RETS_SERVER_URL` | From Netlify |
| `RETS_USERNAME` | From Netlify |
| `RETS_PASSWORD` | From Netlify |
| `SYNC_CRON_SECRET` | **Exact** same string as Netlify |
| `MLS_SYNC_INTERVAL_MS` | Optional; default `1800000` (30m) |

### 3. Public domain

Service → **Settings** → Networking → Public Networking → **Generate Domain**
→ `https://<service>.up.railway.app`.

Browser-check: `https://<service>.up.railway.app/health` (JSON, `service: mls-sync`).

### 4. Netlify site env

| Variable | Value |
| --- | --- |
| `MLS_SYNC_SERVICE_URL` | `https://<service>.up.railway.app` (no trailing slash) |

Trigger a Netlify production deploy so Admin picks up the URL.

### 5. Flip Admin + prove

1. Admin → Syncs → **Configure** → Incremental → **Railway service**.
2. **Sync now** — watch End move; Status should show Railway heartbeat.
3. Smoke:

```bash
npm run smoke:incremental -- --mls=24196609,24196740
```

PASS = End ≤70m + both MLS#s in Neon. Do **not** trust disposable 202-queued.

### 6. Decommission EventBridge Incremental

Pause/delete the AWS Incremental schedule (+ API destination path if unused).
Keep the AWS account. Netlify thin Incremental cron / watchdog skip while
Scheduler is Railway.

## Local

```bash
npm run start:mls-sync
# other terminal:
curl -s http://localhost:8080/health
curl -s -X POST http://localhost:8080/run -H "Authorization: Bearer $SYNC_CRON_SECRET"
```

## Rollback

Admin → Configure → Incremental → **Netlify cron** (temporary). Fix Railway
logs / env, then flip back.
