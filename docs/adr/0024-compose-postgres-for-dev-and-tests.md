# Docker Compose Postgres for dev and tests

Local Postgres is a Compose service. Whiteboard `dev` and the spike tests use that instance. Tests use a **separate database name** (migrate in Vitest global setup) so they do not wipe dev data. Not SQLite, not Testcontainers, not a hosted branch.

**Considered options:** Compose with a dedicated test database; Testcontainers; hosted DB branches.
