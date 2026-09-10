# Request/Response models live next to Route Handlers

Zod Request/Response models sit beside the App Router files (`app/api/todos/...`), not in `src/todo/infrastructure`. OpenAPI is generated from those models. `src/todo` owns domain, application (commands/queries/handlers), and Prisma repository adapters — not HTTP schema types.

Route files are not allowed to call Prisma or the aggregate directly; they still map to commands/queries. This is Next-colocated adapters, not a collapse of CQRS.

**Considered options:** HTTP contract in `src/todo/infrastructure/http`; models next to Route Handlers; RequestModels in the application layer.
