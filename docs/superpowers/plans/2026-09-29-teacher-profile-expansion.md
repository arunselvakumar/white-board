# Teacher Profile Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let an Owner create and edit a complete Teacher profile, capture a photograph, record weekly availability and private verification/pay details, and manage supporting documents.

**Architecture:** Extend the existing `training` Teacher aggregate and Owner-only HTTP commands. Store profile fields and a small photograph in Postgres; store bounded private documents in a separate TeacherDocument resource. Encrypt ID numbers, bank account numbers, and document bytes with an application key before persistence. Keep binary content out of list responses and serve it through Workspace-scoped authenticated routes.

**Tech Stack:** Next.js Route Handlers, Zod HTTP models, training domain/application/infrastructure, Prisma/Postgres, Clerk Owner gate, React Hook Form, `@repo/ui`, Storybook, Vitest.

**Spec:** `docs/prd/training-institute-teachers.md` plus the approved field table and the user's clarification to include its Later rows.

## Global Constraints

- Teacher remains a Workspace resource separate from a Clerk User.
- Only the Owner may read or write Teacher profile, photo, documents, verification, and pay details.
- Existing invitation email stays immutable after Teacher creation.
- All new routes appear in `/api/docs`; all resource reads are scoped to the Active Workspace.
- No payroll payment processing or external background-check integration is introduced; the fields record Owner-entered information.
- Images: JPEG/PNG/WebP, up to 2 MiB. Documents: PDF/JPEG/PNG, up to 3 MiB each, ten active documents per Teacher. Validate signatures and never trust MIME alone.
- Photo is required by the Add Teacher UI, while the API accepts omission for existing clients and existing Teacher records.
- `TEACHER_PRIVATE_DATA_KEY` is a 32-byte base64 key required when storing private numbers or documents.

## Review Focus

- A malformed or oversized upload must fail before any Teacher/document mutation.
- A Teacher or another Workspace must not fetch photo or documents.
- A profile update that omits private numbers must preserve them; explicit clearing must remove them.
- Add Teacher must not create a duplicate record when a follow-up document upload fails.
- Existing Teachers without photos must still load and remain editable.

---

### Task 1: Profile domain and persistence

**Files:** `apps/whiteboard/src/training/domain/teacher.ts`, `teacher.test.ts`, `teacher-repository.ts`, `teacher-handlers.ts`, `prisma-teacher-repository.ts`, `packages/db/prisma/schema.prisma`, new migration.

**Interfaces:** Extend Teacher create/update with personal, contact, teaching, availability, verification metadata, and pay fields. Repository accepts optional photo bytes and encrypted private numbers.

- [x] Write domain tests for normalization, limits, dates, availability overlaps, optional updates, and preserving omitted private numbers.
- [x] Run the tests and observe the expected failures.
- [x] Add the domain fields and migration, then map them through handlers and repository.
- [x] Run domain tests and a real Postgres repository round trip.

### Task 2: Private uploads and encryption

**Files:** new training TeacherPhoto/TeacherDocument support, private-data encryption helper and tests, Prisma model and repository.

**Interfaces:** Decode and validate base64 photo/document content; encrypt and decrypt private numbers and document bytes with `TEACHER_PRIVATE_DATA_KEY`.

- [x] Write failing tests for valid content, mismatched signatures, size limits, encryption round trip, and missing key.
- [x] Run the tests and observe the expected failures.
- [x] Implement bounded binary storage and encryption, then run focused tests.

### Task 3: HTTP and OpenAPI

**Files:** Teacher create/update/response models and routes, photo and document routes, OpenAPI document/builder, HTTP tests.

**Interfaces:** JSON profile commands; `GET /api/teachers/{id}/photo`; document list/create/get/remove endpoints. Return masked private numbers, never ciphertext.

- [x] Write failing Postgres HTTP tests for create/update/read, photo/document round trips, role and Workspace isolation, invalid uploads, and omitted versus cleared private values.
- [x] Run the tests and observe the expected failures.
- [x] Implement routes/models/OpenAPI and run focused HTTP tests.

### Task 4: Add and edit Teacher UI

**Files:** Teacher form, create/detail/list screens, query types, Storybook stories, small photo/document input components.

**Interfaces:** Sectioned form with camera/upload photo, profile and private fields, availability rows, document attachment controls and retryable uploads.

- [x] Add Storybook play coverage for required photo, validation, availability, edit, and document selection.
- [x] Run the Storybook tests and observe the expected failures.
- [x] Implement the UI and run Storybook tests at desktop and narrow widths.

### Task 5: Verification and documentation

**Files:** Teacher spec, `.env.example`, developer README as needed.

- [x] Document the expanded fields, visibility, upload limits, and private data key.
- [x] Run `bun run generate`, migrations, `bun run test`, `bun run test:http`, `bun run check-types`, `bun run lint`, `bun run build`, and Storybook verification.
- [x] Inspect the final diff for missing fields, unintended exposure, and compatibility.
