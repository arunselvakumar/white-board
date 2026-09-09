# Clerk ids are opaque foreign keys; we do not copy User or Workspace

Postgres holds resource tables only. There is no `User` or `Workspace` table. The sample Todo stores `workspaceId` (Clerk Organization id) and `createdByUserId` (Clerk User id) as opaque strings. `id` is a UUID we mint. Open vs completed is `completedAt` (null = open).

Clerk remains the source of truth for **User** and **Workspace**. We do not sync those records into Prisma in this spike.

**Considered options:** resource table + Clerk ids; synced User/Workspace tables; autoincrement with no tenant or actor.
