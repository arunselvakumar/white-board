# CM-0001 — Construction Management is its own app with its own `construction_*` schemas

- Status: accepted
- Date: 2026-10-08
- Ticket: CM-001

Construction Management is a new, greenfield product for Indian builders and contractors; customers start fresh, with no data migrated from other tools. It shares nothing with the education product except people who write code, the design system, and the identity layer. It must not leak into Whiteboard's contexts, and Whiteboard must not leak into it.

## Decision

**An app of its own.** `apps/construction-management` is a separate Next.js app on **:3002** (Whiteboard is :3001, the Marketing Site :3000). It has its own `app/api` Route Handlers, its own `/api/docs`, its own Storybook, its own CONTEXT.md, and its own ADRs (`CM-00NN`) in `apps/construction-management/docs/adr/`. Root ADRs still apply (modular monolith per context, commands and queries without a bus, Zod only at HTTP, OpenAPI from request models, error envelope, soft delete, cursor pagination, HTTP tests on Postgres) unless a CM ADR says otherwise.

**Shared packages, reused as they are.**

| Package                    | Used for                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@repo/auth`               | Users, Sessions, Companies (Better Auth organizations), memberships, invitations. The app imports `@repo/auth/construction/*`, which configures the same tables differently. |
| `@repo/ui`                 | Components, tokens, `globals.css` (root ADR-0002, ADR-0003).                                                                                                                 |
| `@repo/db` (`packages/db`) | The only Prisma client. One schema file per context: `prisma/schema/construction-<context>.prisma`.                                                                          |

**Company = Workspace.** A Company is a Better Auth organization stored in `identity.workspaces` (root ADR-0034). The app holds `workspaceId` and `userId` as opaque strings and never joins to `identity`. CM-0002 records the auth details.

**One Postgres schema per context, in the app's own database.** Each bounded context gets the schema `construction_<context>`, Prisma models and enums prefixed `Construction<Context>`, the API prefix `/api/construction/<context>`, and OpenAPI components with the same prefix. Inside a context folder names are unprefixed.

The app connects to its **own database** — `construction` in development, `construction_test` in HTTP tests, an RDS database `construction` in production (`03-target-architecture.md §1`) — through the same `@repo/db` client with a different `DATABASE_URL`. `packages/db` keeps **one** Prisma schema and **one** migration history, so every migration runs in both databases: Whiteboard's `training_institute` schema exists, empty, in `construction`, and the `construction_*` schemas exist, empty, in `whiteboard`. That costs a few empty tables and buys one client, one `prisma generate`, one migration workflow, and no cross-product data in either database.

**The twelve contexts** (`03-target-architecture.md §2`):

| Context        | Postgres schema             | API prefix                       | Prisma prefix               |
| -------------- | --------------------------- | -------------------------------- | --------------------------- |
| `organization` | `construction_organization` | `/api/construction/organization` | `ConstructionOrganization…` |
| `masters`      | `construction_masters`      | `/api/construction/masters`      | `ConstructionMasters…`      |
| `projects`     | `construction_projects`     | `/api/construction/projects`     | `ConstructionProjects…`     |
| `site-work`    | `construction_site_work`    | `/api/construction/site-work`    | `ConstructionSiteWork…`     |
| `tracking`     | `construction_tracking`     | `/api/construction/tracking`     | `ConstructionTracking…`     |
| `procurement`  | `construction_procurement`  | `/api/construction/procurement`  | `ConstructionProcurement…`  |
| `finance`      | `construction_finance`      | `/api/construction/finance`      | `ConstructionFinance…`      |
| `labour`       | `construction_labour`       | `/api/construction/labour`       | `ConstructionLabour…`       |
| `sales`        | `construction_sales`        | `/api/construction/sales`        | `ConstructionSales…`        |
| `hrms`         | `construction_hrms`         | `/api/construction/hrms`         | `ConstructionHrms…`         |
| `reporting`    | `construction_reporting`    | `/api/construction/reporting`    | `ConstructionReporting…`    |
| `messaging`    | `construction_messaging`    | `/api/construction/messaging`    | `ConstructionMessaging…`    |

A context's schema file and migration are added by the milestone that first needs it, not up front. `src/shared-kernel` (Money, Quantity, ids, audit, tombstones; later SequenceRule, BackdatedPolicy, Approval) has no schema of its own; its tables (`audit_events`) live in `construction_organization`.

**No cross-imports, enforced by ESLint.**

- A context under `src/<context>/` may import its own folder and `src/shared-kernel/` only. `shared-kernel` imports no context.
- The construction app never imports from `apps/whiteboard`, and Whiteboard never imports from the construction app (they are separate packages with no dependency on each other; nothing to configure).
- Only `@repo/auth` imports `better-auth`.

**Preview and CI.** GitHub Actions runs lint, typecheck, format, unit tests, HTTP tests and the Storybook tests for the app on every pull request (the existing workflow, extended). Preview deployments use **Vercel for now** — a `construction-management` Vercel project with Root Directory `apps/construction-management`, whose GitHub integration posts the preview URL on each pull request. ECS Fargate (`03-target-architecture.md §1`) replaces it when the worker and S3 arrive (M9); that move gets its own ADR. Production migrations follow the root ADR-0036 pattern (`scripts/vercel-build.sh` migrates only on production deploys).

## Considered options

- **A folder inside Whiteboard** (`apps/whiteboard/src/construction-*`): one deployable, but two products in one session, one nav, one `/api/docs`, and every Whiteboard deploy carrying construction code. Rejected.
- **Schemas in Whiteboard's database:** fewer databases locally, but Whiteboard and Construction Management have different hosting (Vercel/Neon vs AWS RDS) and different customers; sharing a database would share a User table across two products by accident. Rejected.
- **A second Prisma schema and client for construction:** cleaner databases, but two generators, two migration histories and two `PrismaClient` types in one repo, against root ADR-0010. Rejected for now.
