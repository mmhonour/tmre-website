/**
 * Catch-up step interpretation for dedicated workers.
 * A queue ack is not a finished rebuild — treating it as done is the
 * overdue-stamp deadlock (Goldilocks / Edge / stats / DOTD).
 */

export type CatchupStepLike = {
  job: string
  ok: boolean
  /** True when runAdminSyncAction only enqueued another worker. */
  queued?: boolean
}

export type CatchupResultLike = {
  skipped: boolean
  steps: readonly CatchupStepLike[]
}

/** True only when catch-up actually finished this job in-process. */
export function catchupFinishedJob(
  catchup: CatchupResultLike,
  job: string,
): boolean {
  if (catchup.skipped) return false
  return catchup.steps.some(
    (step) => step.job === job && step.ok && !step.queued,
  )
}
