# Dependency updates with Renovate

Nothing kept Whiteboard's dependencies current. Versions are pinned exactly, so they only moved when someone remembered to bump them, and security fixes waited on that too.

## Decision

[Renovate](https://docs.renovatebot.com/) opens the update pull requests, configured in `renovate.json` at the repo root. It runs as the hosted **Renovate GitHub App** (Mend), so there is no workflow to maintain and no token to store as a secret.

- **Weekly, Monday before 6am UTC.** Minor and patch updates arrive together in one `non-major dependencies` PR. Lock file maintenance runs on the same schedule.
- **Major updates wait for approval.** They are listed on the Dependency Dashboard issue; ticking one opens its PR. Majors in the same family (React, Next.js, Storybook, Prisma, …) arrive together.
- **Security fixes skip the schedule** and open as soon as GitHub reports the vulnerability.
- **A release must be 3 days old** before Renovate proposes it, so a compromised or yanked npm release has time to be pulled first.
- **Bun moves as one.** The `packageManager` field and CI's `setup-bun` version update in the same PR.
- **GitHub Actions are pinned to commit digests**, and Renovate keeps the digests current.
- **Postgres majors are off.** Local and CI Postgres track the production database (Neon); change them by hand when Neon moves.
- **Nothing automerges.** CI must pass and a person merges. `check-dependency-version-consistency` still holds, because Renovate updates a dependency in every workspace in the same PR.

**Considered options:** Dependabot (works, but has no Dependency Dashboard and cannot keep the CI Bun version in step with `packageManager`); self-hosted Renovate in GitHub Actions (same result, but needs a GitHub App or PAT secret and a workflow to maintain); the hosted Renovate app (chosen).
