# Preschool context

The Preschool bounded context (ADR-0055). Product words: `CONTEXT.md` and `docs/prd/preschool-p0.md`. Tickets: `docs/prd/preschool-tasks.md`.

## Where things go

| What                               | Where                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Pure rules, no Prisma, no Zod      | `src/preschool/domain/<area>.ts` (+ `.test.ts`)                                               |
| Use cases, JSON-ready views, ports | `src/preschool/application/<area>-handlers.ts`, `<area>-views.ts`, `<area>-ports.ts`          |
| Prisma                             | `src/preschool/infrastructure/prisma-<area>-store.ts`, wiring in `create-<area>-handlers.ts`  |
| Routes and Zod models              | `app/api/preschool/<area>/route.ts`, `<area>-models.ts`, `<area>.http.test.ts`                |
| OpenAPI                            | `app/api/preschool/<area>/openapi.ts` (already listed in `app/api/preschool/_lib/openapi.ts`) |
| Client reads and writes            | `src/queries/preschool/<area>.ts`                                                             |
| Screens                            | `app/(app)/preschool/<area>/…/page.tsx`, components in `_components/` beside the page         |

One area's files belong to one ticket. Do not edit another area's files; if you need something from it, read its rows through your own store.

## Rules every route follows

- Start with a gate from `app/api/preschool/_lib/session.ts`: `requirePreschoolActor()`, `requirePreschoolStaff()`, `requirePreschoolManager()` or `requirePreschoolOwner()`. It returns a `PreschoolActor` or the error `Response`.
- Pass the actor as the first argument of the handler. The handler checks the Centre, Classroom or Child with `assertCentre`, `assertManagerOf`, `assertClassroom`, `canReadChild` from `application/access.ts`. A Teacher never receives fee amounts.
- A read about one Centre takes `centreId` in the query; a create takes `centreId` in the body; a route addressed by id loads the row by `{ id, workspaceId }` and reads its `centreId`. Never accept `workspaceId` from the client.
- Throw `notFound`, `conflict`, `forbidden` or `invalid` from `domain/errors.ts`; the route catches with `mapPreschoolError`. Do not add codes to the shared `mapError`.
- Named operations, not PATCH: `POST /api/preschool/children/{id}/withdraw` (ADR-0015).
- Zod models are named `…Preschool…Model` (`CreatePreschoolChildRequestModel`) and live only beside routes. No `.transform` in request models.
- Money is integer paise. Calendar dates are `YYYY-MM-DD` strings in views and requests; convert with `domain/dates.ts`. "Today" is `todayInIndia(now)`; handlers take `now: () => Date`.
- Ids are `randomUUID()`.
- Lists that can grow (Children, Enquiries, payments, movements) are paged with `limit` + `cursor` and return `total`; small masters (Programmes, Classrooms of a Centre, Fee Heads) return everything.

## Tests

- HTTP tests run against Postgres: `export DATABASE_URL_TEST=…` first (Vitest does not read `.env`), then `bunx vitest --project=http --run app/api/preschool/<area>`.
- Use `app/api/preschool/_lib/testing.ts`: `seedPreschool`, `addClassroom`, `addStaff`, `addChild`, `signInAsOwner`, `signInWithEmail`, `signOut`, `removePreschool`. `me/me.http.test.ts` is the pattern. Every area tests at least: the happy path, 403 for a role that may not, 403 for another Centre, 404 for another Workspace's id.

## Screens

- Shell pieces are in `app/(app)/preschool/_components/`. `useActiveCentre()` gives `{ me, centre, centres, setCentreId }`; `me.role` decides what a screen shows.
- Follow `.grok/skills/frontend-patterns` and `.grok/skills/tanstack-query`: `@repo/ui` components, react-hook-form + zod, `useSuspenseQuery` + `queryOptions`, `EmptyState` (ADR-0054), skeletons that match the page (ADR-0047).
- Teacher screens (attendance, Daily Report, Observations) must work at 375 px.
- Say Centre, Programme, Classroom, Child, Parent, Authorised Pickup, Admission, Enquiry, Fee Head, Fee Structure, Invoice, Fee Payment, Receipt, Daily Report, Announcement, Observation, Progress Report, Stock Item. Never Student, Batch, Course or Enrollment.

## Demo data

`bun run seed:preschool` (from `apps/whiteboard`, with `DATABASE_URL` in `.env`) deletes and rebuilds two demo Workspaces through the real handlers: **Little Steps Preschool**, a franchise with Anna Nagar, Velachery and Coimbatore – RS Puram, and **Tiny Tots Playschool**, a single Centre. Dates are relative to today in India, and the same data comes back on every run. The script is `scripts/seed-preschool-demo.ts`, one function per area.

Every login's password is `Preschool@123`:

| Login                             | Who                                                 |
| --------------------------------- | --------------------------------------------------- |
| `meera@littlesteps.demo`          | Owner, Little Steps (Head Office)                   |
| `head.velachery@littlesteps.demo` | Centre Head and franchisee, Velachery               |
| `teacher.anna@littlesteps.demo`   | Teacher, Class Teacher of Nursery A at Anna Nagar   |
| `parent.sharma@littlesteps.demo`  | Parent of Aarav (Nursery A) and Anika (Playgroup A) |
| `owner@tinytots.demo`             | Owner, Tiny Tots Playschool                         |
