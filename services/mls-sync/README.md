# mls-sync (Railway)

Always-on service: the **sync job runner**. It owns SmartMLS RETS → Neon and the
other long jobs; Netlify is **not** in the pull path.

**Morning cutover canvas (step checklist):** open
`railway-mls-sync-setup.canvas.tsx` beside chat (Cursor canvases folder).

## What it does

The process itself runs no job. It does two things:

1. **Sweep** — notices a job's Configure slot has come round and puts a row on
   the `sync_queue` table in Neon.
2. **Drain** — claims the next queued row, **forks a child process** to do the
   work, and writes the outcome back.

Forking is the point. An out-of-memory kill takes the child, not the service; a
job past its Budget can actually be killed (SIGTERM, then SIGKILL); and either
way the queue row records `timeout` / `crashed` with the exit code instead of
sitting on "running" forever.

The queue is also the handoff that replaced the per-job Scheduler radio. Admin
**Sync now**, the Netlify thin crons, EventBridge ingress and these sweeps all
enqueue; this service claims. Netlify runs a job itself only when a row has sat
unclaimed long enough to prove this service is gone.

Endpoints (all writes need Bearer `SYNC_CRON_SECRET`):

| Route | Does |
| --- | --- |
| `GET /health` | Runner state, current child, queue snapshot, Neon End/Start/heartbeat |
| `POST /enqueue` | `{ "jobId": "incremental", … }` — put a row on the queue at manual priority |
| `POST /drain` | Poke the drain now instead of waiting for the next poll |
| `POST /run`, `/stats`, `/scores`, `/deal-of-the-day`, `/property-addresses`, `/vision-addresses`, `/market-digest` | Legacy per-job aliases; they enqueue like `/enqueue` |

Runner jobs on the queue: incremental, listing-scores, stats-cache, deal-of-the-day, property-addresses, **vision-addresses**, market-digest, **open-houses**. Vision used to hop to a Netlify background worker (HTTP 429 on that invoke); the runner is the pull now, with the worker only as stranded-row rescue. Open houses has no Netlify worker.

Stamps `last_incremental_sync` when a pull finishes, and
`last_mls_sync_heartbeat` ~60s — including while a child is working, since an
idle parent is exactly what a healthy run looks like now.

## Deploy (cheapest path — demain matin)

### 0. Code on GitHub

Push the mls-sync cutover to the branch Railway will deploy (usually `main`).
Railway’s default builder is **Railpack** (not Nixpacks) — config lives in
[`railpack.json`](../../railpack.json) + [`railway.toml`](../../railway.toml).

**UI (Settings → Build):** leave Builder = **Railpack**. Build Command empty or
`echo mls-sync: skip app build` — never `npm ci`. Start command =
`npm run start:mls-sync` (also in railway.toml).

Railpack mounts cache dirs; `npm ci` trying to wipe `node_modules/.cache` →
**EBUSY**. We use `npm install` + Node 20 + python/build-essential for
`node-expat`. Optional one-shot: variable `NO_CACHE=1`, redeploy, then remove.

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
| `MLS_SYNC_INTERVAL_MS` | Optional; default `1800000` (30m) — Incremental liveness backstop |
| `MLS_SYNC_CHILD_MAX_OLD_SPACE_MB` | Optional; heap cap passed to each forked child so a runaway job hits its own ceiling before the container's |
| `RESEND_API_KEY` | Needed for the Monday brief — the service says so at boot if it is missing, not at 08:00 Monday |

### 3. Public domain

Service → **Settings** → Networking → Public Networking → **Generate Domain**
→ `https://<service>.up.railway.app`.

Browser-check: `https://<service>.up.railway.app/health` (JSON, `service: mls-sync`).

### 4. Netlify site env

| Variable | Value |
| --- | --- |
| `MLS_SYNC_SERVICE_URL` | `https://<service>.up.railway.app` (no trailing slash; host-only also OK — code adds https) |

Trigger a Netlify production deploy so Admin picks up the URL.

### 5. Prove it

There is nothing to flip: this service claims whatever is on `sync_queue`.

1. Admin → Syncs → **Dashboard** → Incremental → **Sync now**. The Queue column
   should show it queued (with position), then running (with budget counting
   down), then the outcome.
2. Watch End move; Status should show the runner heartbeat.
3. Smoke:

```bash
npm run smoke:incremental -- --mls=24196609,24196740
```

PASS = End ≤70m + both MLS#s in Neon. Do **not** trust disposable 202-queued.

### 6. Decommission EventBridge Incremental

Pause/delete the AWS Incremental schedule (+ API destination path if unused).
Keep the AWS account. Leaving it armed is no longer harmful — ingress enqueues
like everyone else, so a second clock only double-asks and deduplicates.

## Local

```bash
npm run start:mls-sync
# other terminal:
curl -s http://localhost:8080/health
curl -s -X POST http://localhost:8080/enqueue \
  -H "Authorization: Bearer $SYNC_CRON_SECRET" \
  -H 'content-type: application/json' \
  -d '{"jobId":"incremental"}'
```

## Rollback

Stop the service. Queued rows stay put, and once the heartbeat goes stale the
Netlify thin crons pick up stranded rows and run them there. Fix Railway logs /
env and redeploy; the runner resumes claiming.
