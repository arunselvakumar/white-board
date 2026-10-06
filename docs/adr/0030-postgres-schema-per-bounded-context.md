# One Postgres schema per bounded context

**Supersedes [ADR-0010](./0010-packages-db-is-prisma-only.md)'s "one Postgres, one schema, all tables".** The rest of ADR-0010 still applies.

[Issue #14](https://github.com/white-board-io/white-board-v3/issues/14). Every table we had belonged to the Training Institute product, but the names didn't say so. School, College, University, and Preschool are next. They have different aggregates and rules: a school Student has an Academic Year, Grade, and Section, while a Training Institute Student has Enrollments on Batches. They will not share one `students` table with a `type` column. With generic names, the first School module would collide in three places. Postgres allows only one `students` table and one `class_mode` enum in `public`. Prisma model names are global to the client. OpenAPI component names are global in `/api/docs`.

## Decision

**Postgres.** One Postgres database. Each bounded context gets its own Postgres schema, named after the context in snake case. The Training Institute context is `training_institute`. Its tables keep short names (`training_institute.students`), and so do its enums (`training_institute.class_mode`). `public` holds only `_prisma_migrations`. It stays reserved for tables shared across contexts, and we don't add any until a second context exists and the overlap is real.

**Prisma.** `packages/db` uses Prisma's multi-file schema: `prisma/schema/base.prisma` for the generator and datasource, and one file per context (`prisma/schema/training-institute.prisma`). Every model and enum in a context file has `@@schema("<schema>")`. Prisma names are global, so models and enums carry the context prefix (`TrainingInstituteStudent`, `TrainingInstituteClassMode`). `@@map` keeps the table and type names short.

**HTTP.** Routes live under `/api/<context>/` (`/api/training-institute/students`). Request/Response models and OpenAPI components are global names in `/api/docs`, so they carry the context prefix too (`CreateTrainingInstituteStudentRequestModel` in code, `TrainingInstituteStudent` in the spec). Cross-cutting routes that aren't a context's resource stay at the top level: `/api/docs`, `/api/openapi.json`, and `/api/webhooks/*`. Webhook URLs are configured with the provider, so moving them is a deploy step, not a refactor.

**Code.** The context folder matches the schema name: `apps/whiteboard/src/training-institute/{domain,application,infrastructure}`. Inside the folder, domain, application, and infrastructure names don't take the prefix. The folder is the namespace, and `Student`, `Batch`, `PrismaStudentRepository` are the context's own words. Code that needs two contexts imports with an alias (`import { Student as TrainingInstituteStudent }`). An ESLint rule stops one context from importing another context's folder.

## What stays the same

- Tenancy: `workspace_id` on every row, scoped to the Active Workspace (ADR-0014). A Workspace has exactly one institution type (ADR-0025), so a schema never holds two products' rows for one tenant.
- Context isolation: a context's infrastructure uses only its own Prisma models, refers to other contexts by ID, and never joins across contexts. A cross-schema join in raw SQL is easy to spot in review.
- Raw SQL names the schema explicitly (`training_institute.batches`). We don't rely on `search_path`.
- Workspace and User identity stay in Clerk (ADR-0018). No Workspace or User table.

## Migration

Moving a table between schemas is `ALTER TABLE … SET SCHEMA`. It changes only catalog metadata, so it is fast and keeps data, indexes (including partial unique indexes written by hand), constraints, and foreign keys. Enums move with `ALTER TYPE … SET SCHEMA`. We write these migrations by hand and never accept a Prisma-generated migration that drops and recreates tables.

**Considered options:** prefix table names (`training_institute_students`), which is a naming convention only, leaves enums global, and costs a `RENAME` per table; one Postgres schema per context (chosen); a separate database or Prisma client per context, which is more operational weight than a modular monolith needs. For code names: prefix everything, which gives very long names such as `TrainingInstituteBatchTeacherAssignmentRepository`; prefix only names in a global namespace (chosen).
