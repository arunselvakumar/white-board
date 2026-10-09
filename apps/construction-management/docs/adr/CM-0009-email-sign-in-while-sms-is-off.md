# CM-0009 — Email sign-in and email invitations while SMS is off

- Status: accepted
- Date: 2026-10-08
- Amends: [CM-0002](CM-0002-company-workspace-and-mobile-otp.md) (sign-in order, Join Request matching)
- Ticket: M2 opening change (owner decision)

ADR CM-0002 made mobile OTP the first way to sign in. Sending texts in India needs a paid SMS provider (MSG91) and DLT registration of the sender and every template, and that needs the business behind the product registered as a company. That registration has not happened yet. Until it does we cannot text a code or an invitation to anyone.

## Decision

**SMS is off by default, behind one switch.** `CONSTRUCTION_SMS=on` turns it on. `isConstructionSmsEnabled()` in `@repo/auth/construction` reads the switch on every request. While SMS is off:

- **Sign-in is email and password**, with the emailed 6-digit code to verify the address and to reset a forgotten password (`/forgot-password`). The sign-in and sign-up screens show the email form alone, with no Mobile tab.
- **The mobile OTP endpoints answer 404.** `/phone-number/send-otp` and `/phone-number/verify` leave the allowed-paths list. The `phoneNumber` plugin stays registered so its types and its `identity.users` columns stay as they are.
- **Invitations go by email and by the share link.** No SMS is sent: `constructionMessaging.sendSms` drops texts while SMS is off, and the invitation notifier does not try. A Join Request matches the signed-in User's verified email. A mobile can only match once it has been verified by OTP, so no mobile matches while SMS is off.
- **A Team Member may still be added with only a mobile.** That person is a record: they cannot sign in or join until someone adds an email. Re-sending the invitation to a member without an email is refused (`MEMBER_EMAIL_REQUIRED`).
- **A mobile is only a contact.** The `MOBILE_LOCKED` rule applies only while mobile is a way to sign in. With SMS off, an Owner can correct a joined member's mobile, and members can change their own in My Profile.

When SMS comes back, setting `CONSTRUCTION_SMS=on` (plus the MSG91 keys and DLT templates, see `.env.example`) restores everything in CM-0002 with no code change. Members who joined by email keep signing in by email.

## Consequences

- HTTP tests sign in by email (`signInByEmail` in `test/sessions.ts`). The mobile OTP tests run inside `withSms()`, and one test proves the endpoints are closed while SMS is off.
- Site staff without an email address cannot use the app yet. They stay records (Team Members without login) until they have an email or SMS returns.
- `modules/01` open question 3 ("is a password login still offered?") is answered: yes, and for now it is the only login.

## Considered options

- **Delete the mobile OTP code:** we would rebuild it in weeks. Rejected.
- **Passwordless emailed code instead of passwords:** the code path already exists for verification, but a second sign-in flow means more screens and tests for this PR. Not now; it can be added later beside passwords.
- **Free SMS gateways without DLT:** not allowed for commercial texts in India. Rejected.
