// Browser resolution: keep the upstream guardrail so a module holding secrets
// (RETS credentials, DATABASE_URL, admin auth) still fails the build if it is
// ever pulled into a Client Component bundle.
throw new Error(
  'This module cannot be imported from a Client Component module. It should only be used from a Server Component.',
)
