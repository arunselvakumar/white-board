# Whiteboard Online Classes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Online and Hybrid Batches use external links or Whiteboard classes with a pre-join page and durable automatic recordings.

**Architecture:** Extend the Batch meeting setting, introduce occurrence records, and put Cloudflare behind a training application port. Next.js routes enforce Active Workspace and role access; R2 stores private recordings.

**Tech Stack:** Next.js Route Handlers, Prisma/Postgres, Clerk, Cloudflare RealtimeKit React UI kit and REST API, R2, TanStack Query, Storybook.

**Spec:** `docs/superpowers/specs/2026-09-30-whiteboard-online-classes-design.md`

## Global Constraints

- Product language and module boundaries follow `CONTEXT.md`, `AGENTS.md`, and applicable ADRs.
- Signed-in Workspace Users only; no public guest links.
- Recording is mandatory for Whiteboard classes and external links are not recorded by Whiteboard.
- Preserve unrelated in-progress edits in the current working tree.

## Review Focus

- A Student in another Workspace or without an active Enrollment receives 404.
- A Teacher not assigned to the Batch receives 404.
- A second start request reuses the occurrence and meeting rather than creating a duplicate.
- A provider or recording failure cannot leave the occurrence joinable without recording.
- A forged or duplicate webhook cannot expose another Workspace's recording.

---

### Task 1: Batch meeting choice

**Files:** Prisma schema/migration, Batch domain and mapper, Batch HTTP models, Batch form, related tests.

**Interfaces:** `meetingOption: "external" | "whiteboard"` on Batch read/write models; `joinUrl` retained for external.

- [ ] Add a failing domain test for meeting choice and external URL behavior; run it red.
- [ ] Add the schema migration and domain/application/HTTP/UI changes; run the test green.
- [ ] Add form Storybook play coverage for both choices.

### Task 2: Occurrences and access

**Files:** Prisma schema/migration, `src/training/{domain,application,infrastructure}/class-*`, class HTTP routes and models, Postgres HTTP tests.

**Interfaces:** `GetClassOccurrence`, `StartClass`, `JoinClass` named operations keyed by Batch/date/start time; reads return Course/Batch/time/meeting option and state.

- [ ] Add failing tests for occurrence identity, schedule validation, owner/assigned Teacher/active Enrollment access; run red.
- [ ] Implement occurrence persistence and access checks; run green.
- [ ] Add routes and OpenAPI entries; verify HTTP tests.

### Task 3: Cloudflare meeting and recording

**Files:** RealtimeKit gateway, class start/join handlers, webhook route, recording repository, download route, tests.

**Interfaces:** Server-only provider creates meeting, adds role-scoped participant, starts recording; webhook marks upload complete; download returns short-lived authorized URL.

- [ ] Add failing handler tests for provider failure, idempotent start, and recording status; run red.
- [ ] Implement provider and R2 configuration, webhook verification, and recording lifecycle; run green.
- [ ] Add HTTP isolation and download tests.

### Task 4: Pre-join and class UI

**Files:** Calendar and Batch links, class query options, class page/components, Storybook stories.

**Interfaces:** `/classes/<batchId>/<date>/<startTime>` opens pre-join; external action opens the saved URL; Whiteboard action starts/joins via API and mounts RealtimeKit UI kit.

- [ ] Add Storybook play functions for external, Whiteboard, waiting, and recording states; run them red.
- [ ] Implement the UI using `@repo/ui` and RealtimeKit UI kit; run stories green.
- [ ] Verify desktop and narrow browser layouts.

### Task 5: Full verification and docs

**Files:** `.env.example`, README, ticket board, OpenAPI, relevant tests.

- [ ] Document Cloudflare app token, webhook, private R2 bucket, and deployment setup.
- [ ] Run `bun run generate`, migration, `bun run test`, `bun run test:http`, `bun run check-types`, lint, build, and Storybook tests.
- [ ] Review the diff for unrelated in-progress edits and report any cloud credential or deployment limitation.
