-- Durable sync work queue.
--
-- Replaces the five in-memory `pending*` slots the Railway mls-sync service used
-- to park a job that arrived while another lane was running. Those slots lived in
-- one process heap, so an OOM or a deploy dropped whatever was waiting and Admin
-- kept painting "Queued" for work nobody was holding any more.
--
-- One row per request. The always-on runner claims a row, forks a child to do the
-- work, and writes the outcome back here — including the ones it had to kill.

CREATE TABLE IF NOT EXISTS sync_queue (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id        text        NOT NULL,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- queued → running → done | failed. Terminal rows are kept for the dashboard.
  state         text        NOT NULL DEFAULT 'queued',
  -- Lower sorts first: Sync now (10) jumps ahead of a sweep (100).
  priority      integer     NOT NULL DEFAULT 100,
  trigger       text        NOT NULL DEFAULT 'sweep',
  requested_at  timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz,
  claimed_by    text,
  -- When the parent must kill the child. NULL until claimed.
  deadline_at   timestamptz,
  heartbeat_at  timestamptz,
  finished_at   timestamptz,
  attempts      integer     NOT NULL DEFAULT 0,
  ok            boolean,
  -- done | failed | timeout | crashed | cancelled
  outcome       text,
  detail        text,
  exit_code     integer,
  signal        text
);

-- Dedupe: asking twice for a job nobody has started yet is one row, not two.
CREATE UNIQUE INDEX IF NOT EXISTS sync_queue_one_waiting_per_job
  ON sync_queue (job_id)
  WHERE state = 'queued';

-- One in-flight run per job, enforced by the database rather than a module flag.
CREATE UNIQUE INDEX IF NOT EXISTS sync_queue_one_running_per_job
  ON sync_queue (job_id)
  WHERE state = 'running';

CREATE INDEX IF NOT EXISTS sync_queue_claim_order
  ON sync_queue (state, priority, requested_at);

CREATE INDEX IF NOT EXISTS sync_queue_recent
  ON sync_queue (requested_at DESC);
