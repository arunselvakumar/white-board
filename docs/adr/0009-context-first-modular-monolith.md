# Context-first modular monolith inside Whiteboard

Application and domain code is sliced by bounded context, then by layer: `apps/whiteboard/src/<context>/{domain,application,infrastructure}`. HTTP adapters stay in `app/api/`. Prisma stays in `packages/db`.

The next business API is a new `src/<context>/` folder, not a new package or a new process. Layer-first roots (`domain/` at app top level) and package-per-context are out until we extract.

The `todo` folder is a sample context for this spike, not a product concept. It is deleted when the first real context ships.

**Considered options:** layer-first folders; context-first folders in Whiteboard; package-per-context.
