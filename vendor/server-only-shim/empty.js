// Server / RSC / Netlify Lambda resolution: importing the marker is a no-op.
// Upstream `server-only` ships a throwing module here, which crashed every
// netlify/functions handler at module init (plain Lambdas get no `react-server`
// condition, so they resolved the throwing build).
