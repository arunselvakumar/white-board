# CM-0002 — A Company is a Workspace; mobile OTP first; roles `owner` and `member`

- Status: accepted
- Date: 2026-10-08
- Ticket: CM-101

Site engineers, supervisors and store keepers know one way to sign in: type a mobile number, receive a code. Many of them have no email address they read. Owners run two or three companies (a building firm and a land firm, say) and switch between them. Mixing coarse roles with a per-member permission matrix gives two answers to "what may this person do" (`modules/01` open question 1).

## Decision

**A Company is a Better Auth organization**, stored as a Workspace row in `identity.workspaces` (root ADR-0034) with `institution_type = construction_company`. Construction code says "Company" and holds `workspaceId` as an opaque string (ADR CM-0001). The app has its own Better Auth instance, `@repo/auth/construction/*`, over the same identity tables, with its own cookie prefix (`construction`), so it never shares a Session with Whiteboard.

**Two roles inside a Company: `owner` and `member`.** The User who creates the Company is its Owner and can do everything, including buying the plan; an Owner cannot be removed. Everyone else is a `member`. What a Member may do comes from the **Permission Matrix** (ADR CM-0003), never from the role. There are no further roles such as Administrator or Builder; Designations with Permission Templates cover that need.

**Sign-in is mobile OTP first, email and password second.**

- Mobile OTP is Better Auth's `phoneNumber` plugin: `POST /api/auth/phone-number/send-otp` then `POST /api/auth/phone-number/verify`. Verifying an unknown number signs the User up (`signUpOnVerification`; a placeholder email `<digits>@mobile.invalid` fills Better Auth's required email column and is never shown or mailed).
- Codes are 6 digits, expire after 5 minutes, allow 5 attempts, and are sent through an `SmsSender` adapter: `msg91` in production, `log` (server console) in development, `outbox` in tests. Better Auth rate-limits the endpoints per IP; a per-mobile limit (5 codes per 15 minutes) stops one number being flooded from many IPs.
- A fixed **test bypass code** (`OTP_TEST_CODE`) is accepted for any number only when `NODE_ENV` is not `production`; the auth server refuses to start in production if it is set.
- Numbers are stored in E.164 (`+919876543210`). Indian numbers must be +91 followed by 10 digits starting 6–9.
- Email and password (with an emailed verification code) stays as a second tab for owners and accountants who prefer it.

**Many Companies per User.** A User may own or join up to 50 Companies and switches the **Active Company** (Better Auth's active organization on the Session). Every API call is scoped to the Active Company and re-reads the member row, so a removed Team Member loses access on their next request.

**Join Requests are Team Member records, not Better Auth invitations.** Better Auth invitations are addressed by email; most invitees have only a mobile number. An Owner (or a Member allowed to create Team Members) adds a Team Member with a mobile and/or email; the record is the invitation (`Joining Pending`). A signed-in User sees a Join Request for every pending Team Member whose mobile matches their verified mobile or whose email matches their verified email. Accepting adds the `member` membership through `@repo/auth` and links the Team Member to the User; rejecting marks it rejected. The invite link (`/join/<token>`) opens the same request but still requires the matching mobile or email.

**HRMS-only Team Members are ordinary `member`s** (Member Type `hrms`) whose Permission Matrix starts from the HRMS default set (HRMS read; Holiday read; Attendance create/read/notification; Leave create/read/notification; Salary read). They have no projects and count against the HRMS seat grant, not the Team Member grant.

## Consequences

- The `identity.users` table gains `phone_number` (unique) and `phone_number_verified`, which Whiteboard ignores.
- A User who signed up by mobile has a placeholder email until they add a real one in My Profile; code must use `emailVerified` and never send mail to `*.invalid`.
- Removing a Team Member deletes the membership through `@repo/auth` and tombstones the Team Member, so their name stays on old records.

## Considered options

- **Email-only auth (Whiteboard's):** wrong for site staff. Rejected.
- **A custom OTP scheme with our own JWTs:** duplicates Better Auth's sessions and rate limiting. Rejected.
- **Roles beside the matrix:** two sources of truth for access. Rejected.
- **Better Auth invitations for joining:** email-only and a second record beside the Team Member. Rejected.
