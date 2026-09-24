---
name: modular-monolith
description: Context-first modular monolith in Whiteboard — domain/application/infrastructure under src/<context>, repository ports in domain, Prisma only in packages/db, no HTTP in domain. Use when adding a bounded context, aggregate, command handler, repository port, or domain event.
---

# Modular monolith

ADR-0009. First product context is `training` at `apps/whiteboard/src/training/{domain,application,infrastructure}`. HTTP stays in `app/api/`. Prisma stays in `packages/db`.

## Layers

| Layer | Lives in | May import |
| --- | --- | --- |
| Domain | `src/<context>/domain` | nothing outside this folder |
| Application | `src/<context>/application` | domain |
| Infrastructure | `src/<context>/infrastructure` | domain, application, `@repo/db` |
| HTTP | `app/api/...` | application, infrastructure, Zod models beside the route |

Domain does not import Zod, Prisma, or Next.js. Copy `todo` layering, not Todo's product language.

## Shared kernel in a context

Every context has `DomainError`, `WorkspaceId`, `UserId` (opaque Clerk ids), and an `EventDispatcher` port. Resource ids are UUID value objects. Clerk ids are trimmed non-empty strings. Do not add a User or Workspace table.

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

Prisma implementations live in infrastructure. Lists are bidirectional cursor + total (ADR-0020). Soft delete is an invisible tombstone (ADR-0019). HTTP is named commands (`POST /api/courses/:id/archive`), not generic PATCH.

## Events

Aggregates record events. After persist, the handler calls `EventDispatcher.dispatch`. `InProcessEventDispatcher` is the P0 implementation. Listeners may be no-ops. No bus, no outbox.

## Do not

- Create `/api/<context>` until the HTTP ticket
- Put repositories in `packages/db`
- Share domain types across contexts via a new package
- Hang fees off Student; Fee Plan belongs to Enrollment
