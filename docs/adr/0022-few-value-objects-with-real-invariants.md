# A few value objects with real invariants

The sample domain wraps `TodoId` (UUID), `TodoTitle` (trimmed, non-empty, max 200), `WorkspaceId` and `UserId` (opaque non-empty Clerk ids). Domain events are types: `TodoCreated`, `TodoCompleted`, `TodoDeleted`.

We do not wrap timestamps or every column. Primitives do not cross the aggregate boundary.

**Considered options:** a few VOs; VO per column; aggregate with raw strings/UUIDs.
