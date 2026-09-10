# List uses bidirectional cursor pagination and a total

`GET /api/todos` is paginated. `ListTodosRequestModel`: `limit?` (default 20, max 100), `after?`, `before?`. Cursors are opaque. `after` and `before` are mutually exclusive (both → 400). Invalid cursor → 400.

`ListTodosResponseModel`: `items`, `nextCursor`, `prevCursor`, `total`. `total` is the count of non-deleted rows in the **Active Workspace**. Order is `createdAt` desc, `id` desc. No offset pagination.

**Considered options:** cap with no pagination; offset/limit; forward-only opaque cursor; bidirectional cursor plus total.
