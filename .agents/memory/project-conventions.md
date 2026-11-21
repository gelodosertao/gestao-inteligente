---
type: project
created: 2026-05-25
updated: 2026-08-11
---

# Project Conventions

## Git Workflow

- Always create a new dedicated branch for major code changes.
- Branch name format should follow: `feature/[task-slug]`, `fix/[bug-slug]`, `improve/[slug]`, or `chore/[slug]`.
- **Never** commit directly to `main` or `homologacao`. Always use PRs.

## Branch Strategy

```
main (Produção) → homologacao (Staging) → develop (Dev)
```

- All feature/fix branches must be created from `develop`.
- PRs flow: `feature/*` → `develop` → `homologacao` → `main`.

## GitHub Issues

- **Every task** (fix, enhancement, or new feature) MUST have a GitHub Issue before work begins.
- Issues must have at least 1 type label and 1 priority label.
- Available type labels: `bug`, `enhancement`, `feature`, `documentation`, `performance`, `security`, `ux/ui`, `infra`, `nfe`.
- Available priority labels: `priority:critical`, `priority:high`, `priority:medium`, `priority:low`.

## Pull Requests

- **Every PR** MUST reference an Issue using `Closes #N` or `Refs #N` in the description.
- PR title format: `<type>(<scope>): <description> (#<issue>)`.
- Use the PR template at `.github/PULL_REQUEST_TEMPLATE.md`.

## Commits

- Follow Conventional Commits: `<type>(<scope>): <description>`.
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.
- Scopes: `nfe`, `pdv`, `dashboard`, `crm`, `estoque`, `financeiro`, `infra`.

## Deploy

- `main` auto-deploys to production (Vercel).
- `homologacao` auto-deploys to staging (Vercel preview).
- Full workflow documented in `CONTRIBUTING.md`.

## AI Agent Rules

- Agents MUST read `CONTRIBUTING.md` before any code changes.
- Agents MUST create an Issue (if none exists) before starting work.
- Agents MUST create a branch from `develop` and open a PR mentioning the Issue.
- Agents MUST NEVER commit directly to `main` or `homologacao`.
