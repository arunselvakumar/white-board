# Student Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Owners and assigned Teachers record and review daily Student Attendance for Training Institute Batches.

**Architecture:** Add Attendance Register and Mark aggregates inside `training`. Route Handlers authenticate Owner or Teacher, then application operations enforce Workspace and Batch assignment rules. Postgres stores roster snapshots and an append-only correction log.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, Prisma/Postgres, Clerk Organizations, TanStack Query, React Hook Form, Zod, Storybook, Vitest.

**Spec:** `docs/prd/training-institute-attendance.md`

## Global Constraints

- Follow `AGENTS.md`, `CONTEXT.md`, and ADRs 0006, 0007, 0009, 0010, 0012, 0014–0021, 0023, 0026.
- Preserve existing uncommitted edits, especially `AGENTS.md` and Course/Batch UI files.
- Keep Prisma in `packages/db`; Zod only beside HTTP routes and in UI forms.
- Keep Teacher access limited to currently assigned Batches and roster names.

## Tasks

### 1. Attendance domain and data

- [ ] Add `AttendanceRegister`, `AttendanceMark`, and correction log tables with Workspace indexes and active Register uniqueness.
- [ ] Add domain date/status/mark invariants with unit tests before implementation.
- [ ] Generate and apply Postgres migrations in development and the HTTP test database.

### 2. Application operations and HTTP

- [ ] Add authorization for Owner and active assigned Teacher, with cross-Workspace 404 behavior.
- [ ] Implement create-or-open Register, list Registers, get Register, and save Marks atomically.
- [ ] Add Owner Student Attendance history query.
- [ ] Add route-local Zod models and OpenAPI entries for every route.
- [ ] Cover create, roster eligibility, completion, correction audit, access roles, empty and foreign Workspace cases with Postgres HTTP tests.

### 3. Owner and Teacher UI

- [ ] Add Owner Attendance navigation and Batch selection page.
- [ ] Add Teacher Attendance links from My Batches and a shared Register page.
- [ ] Add Mark all Present, per-Student status and note controls, save feedback, and summary counts.
- [ ] Add Owner Student Attendance history to Student detail.
- [ ] Add Storybook play functions for the Attendance form and empty state.

### 4. Verification and review

- [ ] Run unit, Postgres HTTP, Storybook, typecheck, lint, and production build.
- [ ] Review Workspace isolation, Teacher assignment changes, roster snapshot history, date boundaries, and atomic writes.
- [ ] Mark WB-004 done only after verification.
