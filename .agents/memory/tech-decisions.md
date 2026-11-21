---
type: project
created: 2026-09-17
updated: 2026-09-17
---

# Technical Decisions

## Supabase homologation

- Creating a Supabase preview branch or separate homologation project was deferred for a future phase.
- The Git workflow and its branches remain unchanged; this decision concerns only the isolated Supabase/PostgreSQL environment.
- Until homologation exists, remote database, Auth, Storage, and Edge Function changes target production and require backup, preflight checks, phased application, and post-change verification.
