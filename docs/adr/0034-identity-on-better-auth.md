# Identity on Better Auth

Clerk bills per user, and Whiteboard will have many Students and Parents who sign in rarely. Before launch, we moved Users, Sessions, Workspaces, members, and invitations to self-hosted [Better Auth](https://www.better-auth.com) (1.7) on our own Postgres. There were no customers and no data to keep: the move is a fresh start, with no User migration. Plan: [`docs/superpowers/plans/2026-10-07-clerk-to-better-auth.md`](../superpowers/plans/2026-10-07-clerk-to-better-auth.md).

**Supersedes:** [ADR-0004](./0004-workspace-owner-is-clerk-org-admin.md) (the Owner role), [ADR-0018](./0018-clerk-ids-as-opaque-foreign-keys.md)'s "no User or Workspace table", and [ADR-0025](./0025-institution-type-in-clerk-public-metadata.md) (where the Institution Type is stored). **Amends:** [ADR-0001](./0001-custom-auth-form-over-clerk-prebuilt-ui.md), [ADR-0005](./0005-custom-workspace-gate-over-clerk-org-ui.md), [ADR-0013](./0013-apis-require-a-session.md), [ADR-0023](./0023-domain-unit-tests-and-http-tests-on-postgres.md), [ADR-0027](./0027-student-and-parent-workspace-invitations.md), and [ADR-0030](./0030-postgres-schema-per-bounded-context.md).

## 1. One package owns the auth vendor

`packages/auth` (`@repo/auth`) is the only code that imports `better-auth`. ESLint enforces this. Its entry points mirror Clerk's shape, so feature code reads the same as before:

- `@repo/auth/server`: `getAuth()` returns `{ isAuthenticated, userId, workspaceId, role, user }`. `protect()` is the layout guard. `workspaces` holds server-side Workspace administration: create, invite, cancel, remove a member, and preview an invitation.
- `@repo/auth/react`: `<AuthProvider>`, `useAuth()`, `useUser()`, `useWorkspace()`, `useWorkspaceList()`, `useSignIn()`, `useSignUp()`, `usePasswordReset()`, `useAcceptInvitation()`, and `useSignOut()`.
- `@repo/auth/roles`: the role union and helpers. `@repo/auth/testing`: the email outbox and test helpers.

Next.js glue stays in the app: the `app/api/auth/[...all]` route, `proxy.ts`, and the UI components built from `@repo/ui`. Workspace access rules (`lib/workspace-access.ts`) stay in the app; they are product rules, not vendor code.

Emails are React Email components in their own package, `packages/email-templates` (`@repo/email-templates`): the Workspace invitation and the verification and reset code emails. `@repo/auth` renders them and sends them with Resend in production. Locally they go to Mailpit, or to the server log. HTTP tests capture them in an in-memory outbox (`EMAIL_TRANSPORT`).

## 2. Identity tables live in the `identity` Postgres schema

Following ADR-0030, Better Auth's tables are Prisma models with an `Identity` prefix in `identity.*`: `IdentityUser` (`identity.users`), `IdentitySession`, `IdentityAccount`, `IdentityVerification`, `IdentityWorkspace` (Better Auth's "organization"), `IdentityWorkspaceMember`, `IdentityWorkspaceInvitation`, and `IdentityRateLimit`. Field names follow Better Auth so its Prisma adapter can use them; `@map` keeps the columns snake case.

There is now a User and a Workspace table, but only identity owns them. `training_institute` keeps referring to a User or Workspace by opaque id. It has no foreign keys into `identity` and no joins across the two schemas. One pending invitation per email per Workspace is enforced by a partial unique index.

## 3. Roles are `owner`, `teacher`, `student`, and `parent`

The User who creates a Workspace is its member with role `owner` (Better Auth's `creatorRole`). There is no `org:` prefix and no admin or member role. `WorkspaceRole` is a string-literal union, so TypeScript flags a leftover comparison with an old Clerk role.

Better Auth's own organization permissions go only to `owner`. Teachers, Students, and Parents have none. What each role may do in the register is still decided by our routes and `isAllowedAppPath`. An invitation can only be for `teacher`, `student`, or `parent`; a second Owner can't be invited. Member roles can't be changed.

## 4. Access is checked on every request

Session cookie caching is off. Every server render and API request reads the session row, then the member row for the Active Workspace (`getAuth()`). Signing out, a password reset, or a removed membership therefore takes effect on the very next request. A Session whose Active Workspace no longer has the User as a member has no `workspaceId` and no `role`. The APIs then answer `403 NO_ACTIVE_WORKSPACE` (ADR-0014).

`proxy.ts` never touches the database. Vercel bundles the proxy as its own function, without Prisma's query engine, and a proxy that queried Postgres crashed there. The proxy is the Auth Gate only: a request without a session cookie goes to Sign-in with its Redirect URL (`@repo/auth/proxy`). It is an optimistic check. `protect()` in the layouts validates the Session against the database, and so does every API route.

Role access to screens moved from the proxy into the Workspace Gate (`mustLeaveAppPath` in `lib/workspace-access.ts`). The gate runs in the browser on every navigation and sends a role away from screens it may not use. Page reads run only in the browser, so a screen's data is never rendered for the wrong role. The APIs behind each screen still enforce the roles with 403; they are the security boundary.

## 5. The auth API is an allowlist

`/app/api/auth/*` answers only the endpoints Whiteboard uses: Sign-in and Sign-up, email verification, password reset by code, the Session, Google OAuth, listing and activating Workspaces, and accepting, rejecting, or reading an invitation. Every other Better Auth endpoint answers 404, including ones a future upgrade adds. For example, any member could otherwise list a Workspace's members and their emails, or create a Workspace without our checks. Server code calls what it needs through `auth.api` or the `workspaces` module.

`/app/api/auth/*` is the one exception to ADR-0013's "every API route requires a Session". It is not part of the OpenAPI document.

## 6. Sign-in, Sign-up, and Password Reset

- **Sign-up:** username, email, and password (at least 8 characters), then a 6-digit code emailed to verify the address. A User with an unverified email can't sign in. Signing up with an existing email doesn't reveal whether the address is in use.
- **Sign-in:** a Sign-in Identifier (username or email) and password, or Google. Google is linked to an existing account only when that account's email is already verified.
- **Password Reset:** a 6-digit code emailed to the address. A reset also verifies the email and signs out every Session.
- **Codes** expire after 10 minutes, are stored hashed, and allow 5 attempts. Sign-in, Sign-up, code, and reset endpoints are rate limited per IP, with counters stored in Postgres so the limit holds across serverless instances.

**Dropped from Clerk:** Clerk's "new device" email code (`needs_client_trust`) has no Better Auth equivalent. P0 ships password plus email verification plus Google; optional two-factor is backlog. Clerk's bot captcha is also gone for now. A Cloudflare Turnstile captcha is backlog, to add before public sign-up opens.

## 7. Invitations

Owner actions that invite people (adding a Student, converting an Enquiry, inviting a Teacher) call `workspaces.invite`. It writes the invitation row and sends the React Email invitation, valid for 7 days. A pending invitation for the same email is reused (ADR-0027: "treated as already sent"), except when a Teacher invitation is resent, which cancels and replaces it. An email that is already a member is not invited again. If sending fails, the invitation is cancelled so a retry can send it.

The link is `/app/accept-invitation?id=<invitation id>`. Accepting always requires a signed-in User whose **verified** email is the invited address (`requireEmailVerificationOnInvitation`):

- **Signed in with the invited email:** accept with one click.
- **Signed out, with an account:** sign in, then accept.
- **Signed out, no account:** sign up with the invited email filled in and locked, enter the 6-digit code, then accept.

We considered treating the invitation link itself as proof of the email, as Clerk's ticket did, and rejected it. The Owner can read invitation ids for their Workspace. They could then create an account on someone else's verified email, and that account would be linked to Students in other Workspaces through family email matching. The code costs one extra step.

A Teacher is linked by invitation: the Teacher row already stores the invitation id. `teacher/activate` finds the invitations this User accepted for role `teacher` in the Active Workspace and activates the Teacher with that invitation id. No invitation metadata is needed. Removing a Teacher's access cancels their pending invitation, or removes the member who accepted it.

## 8. Family links use the User's one verified email

Better Auth has one email per User. A Student or Parent User is linked to Students through `[email]` when `emailVerified` is true, and `[]` otherwise. The domain keeps taking a list, so a second address can be added later without touching it.

## 9. Workspace Creation and the Institution Type

Workspace Creation stays a server action. Better Auth's create endpoint is closed to browsers (`allowUserToCreateOrganization: false`), and the server action calls it as a system action. A User who already belongs to any Workspace can't create one (`organizationLimit: 1`), matching CONTEXT.md. The Institution Type is a required column, `identity.workspaces.institution_type`. It is validated against the available types when the Workspace is created and can't be changed afterwards. The coming-soon types and Other are not stored until they ship.

## 10. Tests

Domain unit tests and HTTP tests on Postgres stay (ADR-0023). HTTP tests mock `getAuth()` through `@repo/auth/testing`, and the 401/403/404 tenancy assertions are unchanged. Identity flows are tested end to end against the real auth route and Postgres, with emails captured in the outbox. CI now runs `test` and `test:http` with a Postgres service.

**Considered options:** stay on Clerk; Auth.js; Better Auth inside the app with no package; Better Auth behind `@repo/auth` (chosen).
