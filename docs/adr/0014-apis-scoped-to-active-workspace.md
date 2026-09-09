# HTTP APIs are scoped to the Active Workspace

Tenant data is addressed by the **Active Workspace** on the **Session**, never by a `workspaceId` in the request body. No Active Workspace → `403` JSON (Session is present; tenant is not).

The sample Todo belongs to that Workspace so the first real context copies a tenancy seam, not a global table. Queries do not return other Workspaces’ rows.

**Considered options:** Active Workspace as tenant; user-scoped with no Workspace; workspace id in the body; skip tenancy on the spike.
