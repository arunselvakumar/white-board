---
name: modular-monolith
description: Context-first modular monolith in Whiteboard — domain/application/infrastructure under src/<context>, repository ports in domain, Prisma only in packages/db, no HTTP in domain. Use when adding a bounded context, aggregate, command handler, repository port, or domain event.
---

# Modular monolith

ADR-0009, ADR-0030. First product context is `training-institute` at `apps/whiteboard/src/training-institute/{domain,application,infrastructure}`. HTTP stays in `app/api/training-institute/`. Prisma stays in `packages/db`, in the context's own schema file and Postgres schema.

## A new bounded context

1. `src/<context>/{domain,application,infrastructure}`. Names inside the folder stay unprefixed (`Student`, `PrismaStudentRepository`).
2. `packages/db/prisma/schema/<context>.prisma`. Add the Postgres schema to `schemas` in `base.prisma`. Every model and enum gets `@@schema("<context_snake>")` and a context prefix (`SchoolStudent`), with `@@map` keeping table names short.
3. Routes under `app/api/<context>/`. Request/Response models carry the context in their names and are listed as components in `app/api/_lib/openapi-document.ts`.
4. Add the context to `BOUNDED_CONTEXTS` in `apps/whiteboard/eslint.config.js`.

## Layers

| Layer          | Lives in                       | May import                                               |
| -------------- | ------------------------------ | -------------------------------------------------------- |
| Domain         | `src/<context>/domain`         | nothing outside this folder                              |
| Application    | `src/<context>/application`    | domain                                                   |
| Infrastructure | `src/<context>/infrastructure` | domain, application, `@repo/db`                          |
| HTTP           | `app/api/...`                  | application, infrastructure, Zod models beside the route |

Domain does not import Zod, Prisma, or Next.js. Copy `todo` layering, not Todo's product language.

## Shared kernel in a context

Every context has `DomainError`, `WorkspaceId`, `UserId` (opaque identity ids), and an `EventDispatcher` port. Resource ids are UUID value objects. User and Workspace ids are trimmed non-empty strings. Do not add a User or Workspace table to a context: they live only in the `identity` schema (ADR-0034).

## Repository ports

Interfaces in domain, bound to the aggregate:

```ts
export type CourseRepository = {
  save(course: Course): Promise<void>;
  findByIdInWorkspace(
    id: CourseId,
    workspaceId: WorkspaceId,
  ): Promise<Course | null>;
  listInWorkspace(params: CourseListParams): Promise<ListPage<Course>>;
};
```

Prisma implementations live in infrastructure. Lists are bidirectional cursor + total (ADR-0020). Soft delete is an invisible tombstone (ADR-0019). HTTP is named commands (`POST /api/training-institute/courses/:id/archive`), not generic PATCH.

## Events

Aggregates record events. After persist, the handler calls `EventDispatcher.dispatch`. `InProcessEventDispatcher` is the P0 implementation. Listeners may be no-ops. No bus, no outbox.

## Do not

- Create `/api/<context>` routes until the HTTP ticket
- Import another context's folder; refer to it by ID
- Put repositories in `packages/db`
- Share domain types across contexts via a new package
- Hang fees off Student; Fee Plan belongs to Enrollment
