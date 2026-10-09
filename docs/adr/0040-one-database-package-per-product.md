# One database package per product

- Status: accepted
- Date: 2026-10-09

**Supersedes [ADR-0010](./0010-packages-db-is-prisma-only.md)'s single `packages/db`, and the "one Prisma schema and one migration history" paragraph of [ADR CM-0001](../../apps/construction-management/docs/adr/CM-0001-app-and-schemas.md).** The rest of both still applies: a database package holds only the Prisma schema, migrations, and client.

Whiteboard and Construction Management are separate products with separate databases, but they shared one Prisma schema and one migration history in `packages/db`. Data never mixed (each app writes only to its own `DATABASE_URL`), but every migration ran in both databases:

- Whiteboard's database held empty `construction_*` schemas, and Construction Management's held an empty `training_institute` schema.
- A Whiteboard production deploy applied construction migrations, and the other way round. A broken migration for one product blocked the other product's deploy.
- Each app's Prisma client carried the other product's models, so `prisma.trainingInstituteStudent` type-checked inside Construction Management.
- Both products wrote to one migrations folder, and the timestamps already collided (two `20261009020000_*`).

## Decision

**Two packages under `packages/db/`, one per product.**

| Package                 | Folder                     | Postgres schemas                                     |
| ----------------------- | -------------------------- | ---------------------------------------------------- |
| `@repo/whiteboard-db`   | `packages/db/whiteboard`   | `identity`, `training_institute` (and later School…) |
| `@repo/construction-db` | `packages/db/construction` | `identity`, `construction_<context>`                 |

Each has its own `prisma.config.ts`, `prisma/schema/` (one file per bounded context, ADR-0030), `prisma/migrations/`, `.env`, and generated client. The client is generated into the package's `generated/client` folder (git-ignored), so the two clients never overwrite each other in the shared `@prisma/client` install. Next.js traces that folder into every route (`outputFileTracingIncludes`).

**Apps import only their own package.** Whiteboard imports `@repo/whiteboard-db`; Construction Management imports `@repo/construction-db`. `@repo/auth` depends on both: its Whiteboard code (`server`, `testing`, `config`) uses `@repo/whiteboard-db`, and `@repo/auth/construction/*` uses `@repo/construction-db`.

**Each product owns its identity schema.** Both databases have an `identity` schema for Better Auth (ADR-0034, ADR CM-0002), but the two `identity.prisma` files are separate and may diverge. At the split, Whiteboard dropped the mobile-OTP columns (`phone_number`, `phone_number_verified`), which only Construction Management uses, and Construction Management dropped `username` and `display_username`, which only Whiteboard's username plugin uses.

**Migration history restarted.** Each package starts from one migration, `0_init`: Prisma's `migrate diff --from-empty` output plus a hand-written section for what Prisma cannot express (CHECK constraints, partial and expression indexes, NOT NULL lists). Before merging we checked it against a database built from the full old history: column, constraint, index, and enum catalogs matched, apart from the dropped identity columns. The old 47 migrations remain in git history.

**Databases reset once.** No customer data existed, so on 2026-10-09 the Whiteboard Neon database and both Construction Management Neon databases (`construction-db`, `construction-preview-db`) had every app schema and `public._prisma_migrations` dropped. `0_init` was then applied. Local databases are reset the same way (see the README). Deploys still migrate as before (ADR-0036 for Whiteboard, CM-0001 for Construction Management), each from its own package.

## Consequences

- Two `prisma generate` runs (both on `postinstall`) and two migration commands: `bun run --filter @repo/whiteboard-db migrate:deploy` and `bun run --filter @repo/construction-db migrate:deploy`.
- A migration lives in the package of the product it changes. Nothing is applied to the other product's database.
- A change to identity is made per product. Copy it to the other package only if that product needs it too.
- `PrismaClient`, `Prisma`, and model types now come from the product's own package. The two clients are different types, so code cannot pass one where the other is expected.

**Considered options:** keep one package and accept the empty schemas (what CM-0001 chose; rejected now because deploys and clients stay coupled); one package with two schema folders and two generators (the same separation, but one package exporting both clients invites the wrong import); a shared `identity.prisma` kept identical by a CI check or a symlink (rejected: each product's Better Auth uses different plugins and should own its tables); keep the old history and mark `0_init` applied with `prisma migrate resolve` (rejected: more steps, and no data needed keeping).
