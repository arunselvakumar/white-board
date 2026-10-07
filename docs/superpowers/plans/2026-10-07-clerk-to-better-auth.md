# Clerk → Better Auth Migration Plan

> **Status:** implemented on `feat/better-auth-migration`. Decisions as built are in [ADR-0034](../../adr/0034-identity-on-better-auth.md), which wins where it differs from this plan. During implementation the auth API also became an allowlist (ADR-0034 §5), and the auth route puts back the `/app` base path that Next.js strips from `request.url`.

**Goal:** Replace Clerk with self-hosted Better Auth so Users, Sessions, Workspaces, memberships, and invitations live in our own Postgres. No per-user bill. The developer experience stays close to Clerk's: `getAuth()`, `protect()`, `useAuth()`, and `useWorkspaceList()`, behind one package.

**Starting point:** This is a fresh start. There are no customers. The Docker Postgres and Vercel databases contain only test data and can be wiped. We do not migrate Clerk Users.

**Branch:** `feat/better-auth-migration` (one PR, as usual).

**Tech:** Better Auth (core + `username`, `emailOTP`, `organization`, `nextCookies`, and `testUtils` in tests only), the Prisma adapter, Next.js 16 `proxy.ts` on the Node runtime, Resend in production, and Mailpit in Docker for dev and tests.

---

## 1. What Clerk does for us today

Inventory from `git grep -i clerk`: about 70 source files, 14 HTTP test files, 25 stories, 10 ADRs, CI, and Turbo.

| Clerk feature we use                                                                       | Where                                                                                                         | Better Auth replacement                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth()` → `userId`, `orgId`, `orgRole`                                                    | `proxy.ts`, 4 `require-*-session.ts`, `class-route.ts`, `calendar/route.ts`, `class-work-session.ts`, 8 pages | `getAuth()` in `@repo/auth/server`: `auth.api.getSession` + an Active Workspace member lookup, wrapped in React `cache()`                              |
| `auth.protect()`                                                                           | `(app)/layout.tsx`, `(onboarding)/layout.tsx`                                                                 | `protect()`: redirect to `/login?redirect_url=…`                                                                                                       |
| `clerkMiddleware`                                                                          | `proxy.ts`                                                                                                    | Plain `proxy.ts` calling `getAuth()` (Node runtime is the Next 16 default)                                                                             |
| `<ClerkProvider>`, `@clerk/ui` theme                                                       | `app/layout.tsx`                                                                                              | `<AuthProvider initialAuth={…}>`, seeded from the server so there is no loading flash                                                                  |
| `useAuth()`                                                                                | ~20 screens (`orgId` and `userId` as query keys, `orgRole` for nav)                                           | `useAuth()` → `{ isLoaded, isSignedIn, userId, workspaceId, role }`                                                                                    |
| `useOrganization`, `useOrganizationList`, `setActive`                                      | `app-shell.tsx`, `workspace-gate.tsx`, `select-workspace-form.tsx`, `create-workspace-form.tsx`               | `useWorkspace()`, `useWorkspaceList()` → `{ workspaces, setActive }`                                                                                   |
| `useSignIn` / `useSignUp` (password, email code, client-trust code, Google, ticket, reset) | `login-form`, `signup-form`, `forgot-password-form`, `accept-invitation-form`                                 | `useSignIn()`, `useSignUp()`, `usePasswordReset()`, `useAcceptInvitation()` with the same `{ error }` return shape, so form diffs stay small           |
| `<UserButton>`, `<SignOutButton>`, `AuthenticateWithRedirectCallback`                      | `app-shell`, `onboarding-shell`, `/sso-callback`                                                              | Our own `<UserMenu>` (from `@repo/ui` DropdownMenu) and `<SignOutButton>`. Delete `/sso-callback` (Better Auth handles the OAuth callback server-side) |
| `clerkClient().organizations.createOrganization` + `publicMetadata.institutionType`        | `lib/create-workspace.ts`                                                                                     | `auth.api.createOrganization` with an `institutionType` **additional field** (a typed column, not metadata)                                            |
| `createOrganizationInvitation`, revoke, list and delete memberships                        | `clerk-student-invitation-sender.ts`, `clerk-teacher-inviter.ts`                                              | `auth.api.createInvitation`, `cancelInvitation`, `removeMember`, plus our own email templates                                                          |
| Invitation `publicMetadata.teacherId` → membership metadata                                | `teacher/activate/route.ts`                                                                                   | Not needed. `Teacher.invitationId` already exists, so activation finds the Teacher by the accepted invitation's id                                     |
| `users.getUser` → verified emails, name                                                    | `require-family-session.ts`, `class-route.ts`                                                                 | The `identity.users` row (`email`, `emailVerified`, `name`, `username`)                                                                                |
| Clerk-hosted email (verification, reset, invitations, new-device codes)                    | All of the above                                                                                              | **We send it ourselves**: an `EmailSender` port with Resend, SMTP (Mailpit), and in-memory outbox transports                                           |
| Bot protection (`#clerk-captcha`) and rate limits                                          | Sign-up, invitation sign-up                                                                                   | Better Auth rate limiter with `storage: "database"` (serverless-safe). A Turnstile captcha plugin is deferred until before the public launch           |
| Error codes (`form_password_incorrect`, …)                                                 | `lib/clerk-errors.ts`                                                                                         | `lib/auth-errors.ts` mapping Better Auth error codes to the same copy                                                                                  |
| Storybook mock of `@clerk/nextjs`                                                          | `.storybook/mocks/clerk.tsx`, `main.ts` alias                                                                 | `.storybook/mocks/auth.tsx` aliased for `@repo/auth/react`                                                                                             |
| Test mocks of `@clerk/nextjs/server`                                                       | 14 `*.http.test.ts`, `proxy.test.ts`, `require-session.test.ts`, `clerk-student-invitation-sender.test.ts`    | `vi.mock("@repo/auth/server")` through one helper, plus real identity rows for invitation tests                                                        |

## 2. Decisions to record before coding

Following our usual workflow, these go into **ADR-0034 "Identity on Better Auth"**. Superseded or amended ADRs get a banner, the same way ADR-0010 has one for ADR-0030. Items marked _(confirm)_ need your yes or no.

1. **New `packages/auth` (`@repo/auth`).** Recommended, and this answers your question about a package. Clerk is hard to remove because ~70 files import it directly. A package gives the vendor **one door**: app code imports `@repo/auth/server`, `@repo/auth/react`, or `@repo/auth/testing`, and an ESLint `no-restricted-imports` rule bans `better-auth` everywhere else. It mirrors `@repo/db`, which owns Prisma. Next-specific glue stays in the app: the `[...all]` route handler, `proxy.ts`, and the UI components that need `@repo/ui`. The package does **not** become a bounded context with domain rules. Workspace access rules (`isAllowedAppPath`) stay in `apps/whiteboard/lib`.
2. **The `identity` Postgres schema** (ADR-0030 pattern). Prisma models are `IdentityUser`, `IdentitySession`, `IdentityAccount`, `IdentityVerification`, `IdentityWorkspace` (Better Auth's "organization"), `IdentityWorkspaceMember`, `IdentityWorkspaceInvitation`, and `IdentityRateLimit`. They map to `identity.users`, `identity.workspaces`, and so on. Better Auth's `modelName` options point at them. **This supersedes ADR-0018's "no User or Workspace table"**: the tables exist, but only the identity schema owns them. `training_institute` keeps referencing them by opaque id, with no cross-schema foreign keys or joins.
3. **Roles become `owner | teacher | student | parent`**, not `org:admin`, `org:teacher`, and so on. Better Auth's `creatorRole: "owner"` gives us a real Owner role, which fixes ADR-0004's "Owner is Clerk's `org:admin`" workaround. `WorkspaceRole` becomes a string-literal union, so TypeScript reports every leftover `=== "org:admin"` comparison as an error ("no overlap"). The compiler finds the stragglers for us.
4. **Code says `workspaceId` and `role`, not `orgId` and `orgRole`.** Domain handlers already take `workspaceId`; the HTTP edge catches up.
5. **Institution Type is a typed column** on `identity.workspaces` (`institution_type`, `institution_type_other`). It is validated in an `organizationHooks.beforeCreateOrganization` hook. Supersedes ADR-0025.
6. **One email per User.** Clerk allowed several verified addresses; Better Auth has one `email` plus `emailVerified`. Family linking (`verifiedEmails`) becomes `emailVerified ? [email] : []`. The `familyEmails()` signature stays an array, so a second address can be added later without touching the domain.
7. **Accepting an invitation always needs a verified email** _(changed during implementation)_. The first idea was to mark the email verified because the invitation link reached that inbox, as Clerk's ticket did. It was rejected: the Owner can read their Workspace's invitation ids, so they could mint a verified account on someone else's email. A new User who arrives on `/accept-invitation?id=…` signs up with the invited email locked, enters the 6-digit code, and then accepts. An existing User signs in, then accepts. See ADR-0034 §7.
8. **Drop Clerk's "new device" email code** (`needs_client_trust`) _(accepted)_. Better Auth has no direct equivalent. P0 ships with password + email verification + Google. Optional TOTP or email 2FA (the `twoFactor` plugin) goes on the backlog. The `second-factor` step and its stories are removed.
9. **Email: Resend in production, Mailpit in Docker for dev, an in-memory outbox for HTTP tests** _(accepted)_. Templates are React Email components in their own package, `packages/email-templates` (`@repo/email-templates`).
10. **Workspace Creation stays server-side** (a server action calling `auth.api.createOrganization`). `beforeCreateOrganization` rejects a User who already belongs to a Workspace (CONTEXT.md: "Not offered once the User already belongs to a Workspace") and any non-available Institution Type. `allowUserToCreateOrganization` stays on.
11. **Access is checked live on every request** _(tightened during implementation)_. The session cookie cache is off, so sign-out, password reset, and revoked sessions take effect immediately. Role and membership come from a single indexed `identity.workspace_members` lookup on each request (`cache()`d per request). Removing a Teacher therefore takes effect on their next request.
12. **Rename `TrainingInstituteTeacher.clerkUserId` → `userId`** (column `user_id`). This is a hand-written `RENAME COLUMN` migration, per ADR-0030's rule about hand-written migrations.

## 3. Package design (`packages/auth`)

```
packages/auth/
  package.json              # exports: ./server ./client ./react ./roles ./testing
  src/
    config.ts               # betterAuth({...}): prismaAdapter(prisma), plugins, modelName maps, hooks
    roles.ts                # WorkspaceRole union, ac/roles, isOwner(), etc. (no Next imports)
    server/
      index.ts              # export { auth, getAuth, protect, workspaces }
      get-auth.ts           # cache(async () => { userId, workspaceId, role, isAuthenticated })
      protect.ts            # protect({ redirectTo? }) → redirect('/login?redirect_url=…')
      workspaces.ts         # server façade: create, invite, cancelInvitation, removeMember,
                            #   findAcceptedInvitation, getUser — what the infrastructure adapters call
    client/index.ts         # createAuthClient({ basePath, plugins: [usernameClient, emailOTPClient, organizationClient] })
    react/
      auth-provider.tsx     # seeds from server snapshot; refreshes via authClient.useSession
      hooks.ts              # useAuth, useUser, useWorkspace, useWorkspaceList,
                            # useSignIn, useSignUp, usePasswordReset, useAcceptInvitation, useSignOut
    email/
      sender.ts             # EmailSender port + transport chosen by EMAIL_TRANSPORT=resend|smtp|outbox
      templates/*.ts        # verify-email, reset-password, workspace-invitation (Teacher/Student/Parent copy)
      outbox.ts             # in-memory outbox for tests: lastCodeFor(email), invitationsFor(email)
    testing/
      index.ts              # mockAuth({ userId, workspaceId, role }), signedOut(), createTestAuth() (adds testUtils)
```

### Server API (Clerk-shaped)

```ts
// @repo/auth/server
export async function getAuth(): Promise<{
  isAuthenticated: boolean;
  userId: string | null;
  workspaceId: string | null; // session.activeOrganizationId, but only when still a member
  role: WorkspaceRole | null;
}>;
export async function protect(): Promise<NonNullable<...>>; // redirects when signed out
export const workspaces: {
  create(input: { name; institutionType; ownerUserId }): Promise<{ id }>;
  invite(input: { workspaceId; inviterUserId; email; role }): Promise<{ id; alreadyPending: boolean }>;
  cancelInvitation(input): Promise<void>;
  removeMember(input: { workspaceId; userId }): Promise<void>; // idempotent
  acceptedInvitation(input: { workspaceId; userId; role }): Promise<{ id } | null>;
  user(userId): Promise<{ name; username; email; emailVerified }>;
};
```

The four `require-*-session.ts` files, `class-route.ts`, `calendar/route.ts`, and `class-work-session.ts` all repeat the same 401/403 ladder. They collapse into one helper in `app/api/_lib`:

```ts
requireWorkspaceSession({ roles: ["owner"] }); // was requireSession
requireWorkspaceSession({ roles: ["owner", "teacher"] }); // was requireAttendanceSession
requireWorkspaceSession({ roles: ["student", "parent"], withEmail: true }); // was requireFamilySession
```

The JSON error codes (`UNAUTHENTICATED`, `NO_ACTIVE_WORKSPACE`, `FORBIDDEN`) stay byte-for-byte identical (ADR-0013/0014/0017).

### Client API (Clerk-shaped)

```ts
const { isLoaded, isSignedIn, userId, workspaceId, role } = useAuth();
const { workspace } = useWorkspace(); // { id, name, institutionType }
const { isLoaded, workspaces, setActive } = useWorkspaceList();
const { password, google, error, fetchStatus } = useSignIn(); // password({ identifier, password }): "@" → email, else username
const { create, sendEmailCode, verifyEmailCode, google, error, fetchStatus } =
  useSignUp();
const { sendCode, reset } = usePasswordReset(); // emailOTP forget-password
const { acceptAsSignedInUser, signUpAndAccept } =
  useAcceptInvitation(invitationId);
```

Each action returns `{ error: AuthError | null }` with `{ code, field? }`, just as the current forms expect from Clerk. `lib/auth-errors.ts` turns that into the same user-facing copy.

### Config essentials and traps

- **The `/app` basePath trap.** Next strips `basePath` for routing, but the request URL Better Auth sees still contains `/app`. Set `basePath: "/app/api/auth"` on the server, and `baseURL` plus the same `basePath` on the client. Google's redirect URI becomes `{origin}/app/api/auth/callback/google`. **The first task proves this with a test** before anything else is built on it.
- `trustedOrigins` covers localhost:3000 and the Vercel production and preview domains (wildcard).
- `session.cookieCache: { enabled: true, maxAge: 300 }`, `advanced.useSecureCookies` in production, and `revokeSessionsOnPasswordReset: true`.
- `emailAndPassword: { enabled, requireEmailVerification: true, minPasswordLength: 8 }`.
- `rateLimit: { enabled: true, storage: "database" }`, with stricter `customRules` on `/sign-in/*`, `/sign-up/*`, `/email-otp/*`, and `/forget-password/*`.
- New env vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_TRANSPORT`, `RESEND_API_KEY`, `EMAIL_FROM`, `SMTP_URL`. Remove all `CLERK_*` vars from `.env.example`, `turbo.json` `globalEnv`, CI, and Vercel.

## 4. Implementation phases

Each phase is a commit. Everything ships as one PR, tracked as cards on the GitHub Project.

### Phase 0: Decisions and words

- [ ] ADR-0034 Identity on Better Auth (the decisions in §2). Add superseded or amended banners to 0001 (custom forms still hold; the vendor changes), 0004, 0005, 0018, 0025, 0027, and 0030 ("identity stays in Clerk").
- [ ] Update `CONTEXT.md`: Session ("a Whiteboard-managed session"), Workspace ("a row in `identity.workspaces`"), Sign-in Flow (drop "Second-Factor Verification when Clerk requires it"), Institution Type storage, and the `org:*` role names → Owner/Teacher/Student/Parent roles.
- [ ] Update `AGENTS.md`, `CLAUDE.md`, `.grok/skills/*`, and `docs/deployment/vercel-services.md`.

### Phase 1: Foundations (Clerk still runs; nothing user-visible changes)

- [ ] `packages/auth` scaffold with workspace deps, tsconfig, ESLint, and `check-types`. Add `@repo/auth` to `transpilePackages`.
- [ ] `packages/db/prisma/schema/identity.prisma` with `@@schema("identity")` and the `Identity*` models (seeded from `bunx @better-auth/cli generate`, then renamed and mapped). Add `"identity"` to `base.prisma` `schemas`. Write the migration by hand and review it.
- [ ] **Spike test (gate for everything after):** an HTTP test that boots `config.ts` against `whiteboard_test`, signs up through `auth.handler(new Request("http://localhost:3000/app/api/auth/sign-up/email"))`, and asserts that rows appear in `identity.users`. This proves that `modelName` with the Prisma adapter and `basePath` both work. **Fallback** if `modelName` fights the adapter: unprefixed models inside the `identity` schema, recorded in the ADR.
- [ ] `app/api/auth/[...all]/route.ts` → `toNextJsHandler(auth)`. Exclude it from the OpenAPI document and from the "every API requires a Session" rule (ADR-0013 amendment).
- [ ] Add Mailpit to `compose.yaml` (SMTP on 1025, UI and API on 8025). Add the `EmailSender` port with Resend, SMTP, and outbox transports, plus the three templates.

### Phase 2: Server cut-over

- [ ] `getAuth`, `protect`, the `workspaces` façade, and `roles.ts`.
- [ ] `requireWorkspaceSession` replaces the four `require-*-session.ts` files and the inline ladders in `class-route.ts`, `calendar/route.ts`, and `class-work-session.ts`.
- [ ] `proxy.ts`: drop `clerkMiddleware`, call `getAuth()`, and keep `isAllowedAppPath`. Drop the `/__clerk` matcher.
- [ ] `(app)/layout.tsx` and `(onboarding)/layout.tsx` → `await protect()`. The 8 pages reading `orgRole` → `getAuth()`. `login`, `signup`, and `forgot-password` pages → `getAuth().isAuthenticated`.
- [ ] `lib/workspace-access.ts` and `lib/app-nav.ts`: switch to the `WorkspaceRole` union and the new role names. Let `tsc` find every leftover.
- [ ] `lib/create-workspace.ts` → `workspaces.create`. Delete `types/globals.d.ts`'s Clerk interface.

### Phase 3: Client cut-over

- [ ] `AuthProvider` in `app/layout.tsx`, seeded from `getAuth()` and the user's Workspaces. Remove `ClerkProvider` and the `@clerk/ui` theme CSS.
- [ ] Hooks in `@repo/auth/react`. Replace `useAuth()` across the ~20 screens (`orgId` → `workspaceId`; query keys keep the same shape).
- [ ] Rewrite the forms: login (identifier + password, Google), signup (details → 6-digit email code → session), forgot-password (email → code + new password), accept-invitation (`?id=`: a signed-in matching User gets one-click accept; a signed-out User sees a "sign in" or "create your sign-in" form with the email locked).
- [ ] `workspace-gate`, `select-workspace-form`, and `create-workspace-form` → `useWorkspaceList().setActive`. Keep the gate's 0/1/many logic.
- [ ] `app-shell`: `<UserMenu>` replaces `<UserButton>` (name, email, Sign out; a later Account page covers password change). `onboarding-shell`: our `<SignOutButton>`. Delete `/sso-callback` and `lib/clerk-errors.ts`.

### Phase 4: Invitations and Teachers

- [ ] `WorkspaceStudentInvitationSender` (was `ClerkStudentInvitationSender`): `workspaces.invite`, where a duplicate pending invitation counts as sent. This keeps the ADR-0027 behavior.
- [ ] `WorkspaceTeacherInviter`: invite with role `teacher` (cancelling the previous invitation first), and `removeAccess` → `removeMember` plus cancel the pending invitation. The membership-metadata scan goes away.
- [ ] `teacher/activate`: `workspaces.acceptedInvitation({ workspaceId, userId, role: "teacher" })` → the Teacher by `invitationId` → `activate(userId)`. `TEACHER_LINK_REQUIRED` stays.
- [ ] Migration: `clerk_user_id` → `user_id`, and rename the index. Rename the domain property and repository method (`findByUserInWorkspace`).
- [ ] Invitation email copy for Teacher, Student, and Parent; the link is `/app/accept-invitation?id=…`.

### Phase 5: Remove Clerk

- [ ] Remove `@clerk/nextjs` and `@clerk/ui`. `bun install`, `check-versions`.
- [ ] Add an ESLint `no-restricted-imports` rule for `@clerk/*` and for `better-auth` outside `packages/auth`.
- [ ] Update the CI env block, `turbo.json` `globalEnv`, and `.env.example`.
- [ ] `git grep -i clerk` returns only ADR history and old plans.

### Phase 6: Deploy

- [ ] Vercel: set the new env vars and remove `CLERK_*`. Run `prisma migrate deploy` against the Vercel Postgres. **Wipe the old test data** (a fresh start, agreed).
- [ ] Google Cloud OAuth client: add the localhost and production `/app/api/auth/callback/google` redirect URIs.
- [ ] Resend: verify the sending domain (SPF, DKIM) and set `EMAIL_FROM`.
- [ ] Delete the Clerk application once production smoke tests pass.

## 5. Testing strategy

The goal is to prove that **no access rule changed** while the vendor did, and to test auth flows that Clerk used to test for us.

### 5.1 Unit (`bun run test`, no database)

- `roles.ts`: role parsing; unknown or legacy strings are rejected.
- `lib/workspace-access.test.ts` and `proxy.test.ts`: the same tables with new role names. `proxy.test.ts` mocks `@repo/auth/server` `getAuth` instead of `clerkMiddleware`.
- `require-workspace-session.test.ts`: a matrix of {signed out, no Active Workspace, removed member, each role} × {each role set}, asserting status **and** error `code`.
- `lib/auth-errors.test.ts`: every Better Auth code we surface maps to the existing copy.
- Email templates: render snapshots, with the link containing the `/app` basePath.
- The `beforeCreateOrganization` hook: rejects a second Workspace and non-available Institution Types.

### 5.2 Identity integration (`bun run test:http`, real Postgres, real Better Auth, outbox email)

New `packages/auth` or `apps/whiteboard/src/identity.http.test.ts`, using `createTestAuth()` (production config + `testUtils`):

- Sign-up → verification code in the outbox → verify → session cookie works. An unverified User cannot sign in.
- Duplicate email and duplicate username are rejected with the right codes. Sign-in by email and by username both work. A wrong password is rejected.
- Password reset by code: old sessions are revoked and the new password works.
- The rate limiter returns 429 after N bad sign-ins.
- Workspace creation: the creator is `owner`, Institution Type is persisted, a second creation is rejected, and `setActive` on a Workspace you don't belong to fails.
- Invitations: create, duplicate pending (no error), accept with a matching signed-in User, mismatched email rejected, expired and cancelled rejected. Sign-up-and-accept marks the email verified and activates the Workspace.
- **Live access:** remove a member while their session cookie is cached, and the next `getAuth()` returns no Workspace and no role.
- `/app/api/auth/*` is reachable at the basePath (the spike test, kept as a regression).

### 5.3 Existing HTTP tests (14 files)

- Replace `vi.mock("@clerk/nextjs/server", …)` with one helper from `@repo/auth/testing`:
  ```ts
  vi.mock("@repo/auth/server", () => authServerMock());
  asOwner("ws_1", "user_1");
  asRole("teacher", "ws_1", "user_t");
  signedOut();
  ```
  The 401/403/404 tenancy assertions stay unchanged. **That is the point:** if they still pass, the access rules survived.
- The teacher and student-invitation tests stop mocking `clerkClient` call-by-call. They run against the real `identity.*` tables with the outbox, so they assert on actual invitation rows and emails. This has more fidelity than the Clerk mocks did.
- Family tests: `verifiedEmails` comes from `identity.users`, including the case where an unverified email is **not** linked.

### 5.4 Storybook (`bun run test-storybook`)

- Swap the alias `@clerk/nextjs` → `.storybook/mocks/auth.tsx` (mocking `@repo/auth/react`).
- Keep or rewrite the play functions for every auth form state: field errors, global error, the email-code step, resend code, invitation (signed-in accept, sign-up with locked email, expired), and the workspace gate (0, 1, or many Workspaces). Delete the second-factor stories.
- Add `UserMenu` stories.

### 5.5 End-to-end smoke (new, small, Playwright against `next dev` + Docker Postgres + Mailpit)

This is a new layer, so ADR-0034 amends ADR-0023's "no Playwright". Clerk hid the email round-trips; now they are our code and need one real test each. The tests read codes and links from Mailpit's HTTP API.

1. Owner signs up → email code → creates a Training Institute Workspace → Owner Dashboard → signs out → signs in with **username**.
2. Owner adds a Student with an email → the Student opens the invitation link → creates a sign-in → lands on Student Home and sees their Enrollment (proves verified-email family linking).
3. Owner invites a Teacher → the Teacher accepts as an **existing** User → `teacher/activate` → My Batches. The Owner removes the Teacher → their next navigation is bounced.
4. Forgot password → code → new password → the old session is gone.
5. A User in two Workspaces → Workspace Selection → switch from the header.

Google sign-in stays on the manual checklist (§5.7): it can't be automated without a real Google account.

### 5.6 CI

CI currently runs lint, typecheck, build, and Storybook, but **not `test` or `test:http`**. As part of this PR, add a `postgres:16` service, `prisma migrate deploy`, `bun run test`, and `bun run test:http`. E2E runs locally first and moves into CI with Mailpit as a service once stable. Replace the Clerk dummy keys with a dummy `BETTER_AUTH_SECRET`.

### 5.7 Manual QA on the Vercel preview (before merge)

Google sign-up and sign-in on the preview domain. Cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`. Invitation emails arrive from the Resend domain without landing in spam. The `/app/api/docs` Swagger "Try it" still works with the Better Auth cookie. A sign-out in one tab is reflected in the other on its next request. A `redirect_url` pointing off-site is ignored (the existing `safe-redirect` rule).

## 6. Risks

| Risk                                                                                 | Mitigation                                                                                                                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/app` basePath and Better Auth URL matching                                         | Phase 1 spike test is a hard gate                                                                                                        |
| Prisma adapter `modelName` with prefixed models                                      | Same spike. Fallback in §4 Phase 1                                                                                                       |
| We now own email deliverability                                                      | Resend + a verified domain. Mailpit in E2E. A failed invitation email is logged and doesn't block admission (as today, ADR-0027)         |
| We now own security patches                                                          | Pin Better Auth, enable Dependabot/Renovate for it, and watch its security advisories                                                    |
| Lost Clerk features: new-device code, bot captcha, multiple emails, hosted dashboard | Recorded in ADR-0034 with backlog items (2FA, Turnstile before public launch, an internal "users" admin page if needed)                  |
| Extra DB query per request for membership                                            | One indexed lookup, `cache()`d per request. Revisit with `customSession` or a role in the cookie cache only if profiling shows a problem |
