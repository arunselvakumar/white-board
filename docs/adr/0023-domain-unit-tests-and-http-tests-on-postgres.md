# Domain unit tests and HTTP tests on Postgres

> **Amended by [ADR-0034](./0034-identity-on-better-auth.md):** identity flows are tested end to end against the real auth route and Postgres, with emails captured in an outbox.

The spike is tested at two layers: aggregate/value-object unit tests (no Prisma), and HTTP (or handler) tests for 401/403/400/404/409 and list cursors against real Postgres. We do not use SQLite for Prisma tests. We do not add Playwright for Todo.

**Considered options:** domain + HTTP on Postgres; domain only; manual Swagger only.
