# HTTP APIs require a Session

> **Amended by [ADR-0034](./0034-identity-on-better-auth.md):** `/api/auth/*` (Better Auth's own endpoints) is the one other route that does not require a Session.

Every Route Handler under `/api` except `/api/docs` requires a **Session**. Missing Session → `401` JSON. We do not redirect API callers to the **Sign-in Flow**; that remains the **Auth Gate** for browser routes.

Swagger stays public ([ADR-0012](./0012-openapi-from-zod-request-models.md)). Trying an operation without a Session fails with 401.

**Considered options:** Session required (401); public APIs; authenticated writes and public reads.
