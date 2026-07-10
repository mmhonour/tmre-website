<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:admin-diagrams -->
# Admin diagrams

When SQLite databases/schema ownership or the Node startup/sync schedule change, keep `/admin` current: live schema via `lib/sqlite-schema-diagram.ts`, startup lanes via `lib/startup-process.ts` (must mirror `instrumentation.ts` / Netlify sync). See `.cursor/rules/admin-diagrams.mdc`.
<!-- END:admin-diagrams -->
