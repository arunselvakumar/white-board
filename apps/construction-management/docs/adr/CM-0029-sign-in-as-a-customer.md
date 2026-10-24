# CM-0029 — Sign in as a customer (support impersonation)

- Status: accepted
- Date: 2026-10-24
- Relates to: ADR CM-0002 (Better Auth sign-in), ADR CM-0009 (email sign-in while SMS is off), ADR-0034 (identity owned by `@repo/auth`)

When a customer reports a problem, White Board staff need to see the app as that customer sees it, and sometimes fix something for them. Asking for their password is not acceptable. The owner asked for a Clerk-style "sign in as" screen: staff give the customer's email and their own `@white-board.io` email, prove the mailbox with a code, and land in the customer's account with a warning on every page.

## Decision

- **The screen is `/sign-in/as`.** It is a public page, like Sign in, and is not linked from anywhere. Step one asks for the **Customer email** and the **White Board email**. Step two asks for the 6-digit code sent to the White Board email.
- **Any `@white-board.io` mailbox is an admin.** The staff member does not need a Construction Management account. Only the code in that mailbox proves who they are. The domain must match exactly (`arun@white-board.io`); a subdomain or a look-alike (`white-board.io.example.com`) is refused.
- **The code belongs to one customer.** It is stored hashed in `identity.verifications`, keyed by the admin email, together with the customer email. It lasts 10 minutes, allows 5 tries, and works once. A new code replaces the last one. One admin email may be sent 5 codes per 15 minutes. `OTP_TEST_CODE` never works here, not even in development: in development the code is in the email log or Mailpit.
- **The customer is checked only after the code.** Asking for a code always succeeds, so the first step never tells anyone whether an email has an account. After a correct code, an unknown customer email answers "No User has this email".
- **The impersonation is a normal Session for the customer, lasting 30 days.** The owner chose the normal Session length over a short one. The Session row stores the admin email in `impersonated_by`. Signing in as someone replaces whatever Session the browser had.
- **Every impersonation is recorded** in `identity.impersonations`: the admin email, the customer's User id and email, the Session id, the IP address, the browser and the time. The row stays after the Session ends. The customer is not emailed.
- **Full access.** While impersonating, staff can do anything the customer can. Nothing is read-only.
- **A banner on every page.** While the Session has `impersonated_by`, an amber bar is pinned to the top of every screen (public, onboarding and in-app): "You are signed in as ravi@acme.in. Impersonated by arun@white-board.io." Its **Stop** button signs out and returns to `/sign-in/as`.

## Consequences

- The customer's Signed-in devices list shows the impersonation Session like any other device, so the customer can see it and sign it out.
- A password reset by the customer signs the impersonation out, like every other Session.
- Anyone who controls a `@white-board.io` mailbox can sign in as any customer. Mailbox security is now account security for every customer.
- Better Auth's `admin` plugin is not used: it needs the admin to be a signed-in User with an admin role, and keeps the admin's own Session in a second cookie to switch back. Here the admin has no account, so Stop simply signs out.

## Considered options

- **A one-hour impersonation Session.** Safer if a laptop is left open. The owner chose the normal 30-day length.
- **Emailing the customer when staff sign in as them.** More transparent; not wanted for now. The audit table makes it easy to add later.
- **Only existing Users on `@white-board.io` can impersonate.** Stricter, but every staff member would need an account first.
- **A floating pill at the bottom of the screen** instead of the top bar. Less in the way, but easier to miss.
