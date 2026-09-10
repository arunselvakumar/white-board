# Soft delete is an invisible tombstone

Delete sets `deletedAt` and `deletedByUserId` (Clerk User id from the **Session**). The row stays. List excludes tombstones. Get, Complete, and Delete-again return **404**, same as missing or other-Workspace — we do not leak that the id existed. There is no restore in this spike.

`deletedByUserId` is audit on the aggregate and in Prisma, not a Response Model field.

This extends [ADR-0018](./0018-clerk-ids-as-opaque-foreign-keys.md). Hard delete and public “deleted” state are out.

**Considered options:** hard delete; invisible tombstone; get returns deleted + restore command.
