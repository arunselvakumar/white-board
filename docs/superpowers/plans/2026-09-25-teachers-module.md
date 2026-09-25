# Teachers Module Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Owners manage Teachers and Batch assignments; Teachers see their assigned Batches.

**Architecture:** Teacher and assignment domain rules live in the existing `training` context. Prisma is confined to infrastructure and `packages/db`; Route Handlers adapt named operations and document them through OpenAPI. Clerk owns User identity and the `org:teacher` Workspace role.

**Tech Stack:** Next.js Route Handlers, Prisma/Postgres, Clerk, Zod at HTTP boundaries, TanStack Query, `@repo/ui`, Storybook, Vitest.

**Spec:** `docs/prd/training-institute-teachers.md`

## Global constraints

- The Active Workspace comes from the Session, never a request body.
- Teachers cannot access Owner register APIs or see Student contact and Fee data.
- Teacher IDs and Batch IDs from other Workspaces return 404.
- Preserve the existing uncommitted Course and Batch form edits.
- All new APIs appear in `/api/docs`.

## Review focus

- Duplicate normalized email in one Workspace returns a conflict.
- Pending invitation failure is visible and can be retried.
- A Teacher cannot activate using another Teacher's invitation metadata.
- Unassignment or deactivation removes My Batches access immediately.
- A Teacher in Workspace A cannot see a Batch assigned in Workspace B.

## Task 1: Teacher data and domain

**Files:** `packages/db/prisma/schema.prisma`, migration, `apps/whiteboard/src/training/domain/teacher*.ts`, domain tests.

- [ ] Write failing domain tests for required name/email/type, deactivation, and assignment lifecycle.
- [ ] Run the targeted tests and confirm the missing behavior fails.
- [ ] Add Teacher and BatchTeacherAssignment tables, indexes, and domain rules.
- [ ] Generate Prisma client and run targeted tests.

## Task 2: Owner commands and invitations

**Files:** `apps/whiteboard/src/training/application/*teacher*`, `infrastructure/*teacher*`, Clerk invitation adapter, tests.

- [ ] Write failing tests for create, update, invite failure/resend, assign, unassign, and deactivate.
- [ ] Run the targeted tests and confirm failure.
- [ ] Implement named operations and a Clerk invitation carrying `teacherId` metadata.
- [ ] Run targeted tests and `bun run check-types`.

## Task 3: HTTP and access

**Files:** `apps/whiteboard/app/api/teachers/**`, `app/api/_lib`, OpenAPI document, HTTP tests.

- [ ] Write failing Postgres HTTP tests for Owner CRUD, assignment, tenant isolation, and role restrictions.
- [ ] Implement route-local Request/Response models and named Route Handlers.
- [ ] Add Teacher activation and My Batches APIs with assignment checks.
- [ ] Register every route in OpenAPI and run HTTP tests.

## Task 4: Screens

**Files:** `apps/whiteboard/app/(app)/teachers/**`, `app/(app)/teacher/**`, `components/teachers/**`, `src/queries/teachers.ts`, nav, proxy, Storybook.

- [ ] Write role, navigation, and Storybook play tests for empty, create validation, assignment, and Teacher view.
- [ ] Build Owner list/add/profile screens and Teacher My Batches screen with `@repo/ui`.
- [ ] Run Storybook tests and inspect the UI in a browser.

## Task 5: Verification

- [ ] Apply migrations to development and test Postgres.
- [ ] Run `bun run test`, `bun run test:http`, `bun run check-types`, and Storybook tests.
- [ ] Inspect `/api/docs`, role boundaries, final diff, and ticket status; mark WB-003 done only when verified.
