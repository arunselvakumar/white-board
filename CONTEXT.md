# Whiteboard

An education-management product with a public Marketing Site and an authenticated Whiteboard application.

## Language

**Whiteboard**:
The authenticated product application. Identity lives here and nowhere else.
_Avoid_: web app, dashboard, platform app, whiteboard app

**Marketing Site**:
The public-facing site. It has no Session and no Sign-in, Sign-up, or Password Reset.
_Avoid_: landing page, marketing app

**User**:
A person who can authenticate into Whiteboard.
_Avoid_: account, customer, client

**Session**:
A Clerk-managed authenticated session for a User, present only inside Whiteboard.

**Sign-in Flow**:
The custom authentication flow at `/login` that produces a Session. Password Sign-in is Sign-in Identifier + password, then Second-Factor Verification when Clerk requires it — or Google Sign-in.
_Avoid_: login, sign-in page, Clerk SignIn

**Sign-up Flow**:
The custom account-creation flow at `/signup` that produces a User. Password Sign-up is two in-page steps: Username, Email, Phone, and password, then Email Verification — or Google Sign-in.
_Avoid_: signup, register, Clerk SignUp

**Password Reset Flow**:
The custom self-service flow at `/forgot-password` that lets a User set a new password.
_Avoid_: forget-password, forgot password flow

**Public Layout**:
The full-screen split-panel shell used only by the Sign-in, Sign-up, and Password Reset Flows. It has no authenticated chrome.

**Auth Gate**:
The Whiteboard-wide rule that every in-app route requires a Session. Unauthenticated requests are sent to the Sign-in Flow.

**Redirect URL**:
The `?redirect_url=<path>` query on `/login` when the Auth Gate bounces an unauthenticated User. After Sign-in, they go to that path. Falls back to `/` if absent or invalid.

**In-app Home**:
The Whiteboard screen at `/` a User lands on after a successful auth flow when no Redirect URL is set.

**Google Sign-in**:
A Sign-in / Sign-up method that authenticates a User with their Google account, without a password.

**Email**:
The User's email address. Usable as a Sign-in Identifier.

**Username**:
A unique handle for a User. Usable as a Sign-in Identifier.
_Avoid_: handle, display name

**Sign-in Identifier**:
The single Sign-in field that accepts either an Email or a Username.
_Avoid_: email(username), login, identifier

**Phone**:
The User's mobile number. Collected in the Sign-up Flow. Not a Sign-in Identifier.
_Avoid_: mobile, cell, phone number as a Sign-in method

**Email Verification**:
The Sign-up step where a User confirms their Email by entering a 6-digit code Clerk sent. Until this succeeds, Sign-up is incomplete and there is no Session.

**Second-Factor Verification**:
The Sign-in step where a User with 2FA enabled enters a 6-digit code Clerk emailed them. Reached only when password Sign-in returns `needs_second_factor`. Until this succeeds, there is no Session.

**Phone Verification**:
A future Sign-up step that would confirm Phone with an SMS code. Not part of the current Sign-up Flow. Tracked in [issue #2](https://github.com/white-board-io/white-board-v3/issues/2).

## Relationships

- A **User** authenticates only on **Whiteboard**
- A **Session** belongs to exactly one **User**
- The **Marketing Site** never holds a **Session**
- The **Sign-in Flow**, **Sign-up Flow**, and **Password Reset Flow** all use the **Public Layout**
- Completing the **Sign-in Flow** or **Password Reset Flow** produces a **Session**
- Password **Sign-in Flow** requires **Second-Factor Verification** when Clerk asks for it, before a **Session** exists
- Completing the **Sign-up Flow** produces a **User** and a **Session**
- Password **Sign-up Flow** requires **Email Verification** before a **Session** exists
- **Phone Verification** is not required to complete Sign-up
- **Google Sign-in** is a method inside both the **Sign-in Flow** and the **Sign-up Flow**, placed after the password submit button
- The **Sign-in Identifier** is either an **Email** or a **Username**, never both at once
- A **User** created with **Google Sign-in** may have an **Email** and no **Username** or **Phone**
- Password Sign-up collects **Username**, **Email**, **Phone**, and a password
- **Phone** is not a **Sign-in Identifier**
- The **Auth Gate** sends any unauthenticated Whiteboard request to the **Sign-in Flow**
- After Sign-in, the **Redirect URL** wins; otherwise the User lands on the **In-app Home**

## Example dialogue

> **Dev:** "Should the Marketing Site have a Sign-in button that opens Clerk?"
> **Domain expert:** "No. Identity belongs to Whiteboard. The Marketing Site is public — no Session, no Sign-in."

> **Dev:** "Can we keep Clerk's prebuilt SignIn card and just restyle it?"
> **Domain expert:** "No. The Sign-in Flow is a custom Public Layout — split panel, our fields, our errors. Prebuilt Clerk UI is not the Sign-in Flow."

> **Dev:** "Should Sign-in have separate Email and Username boxes?"
> **Domain expert:** "No. One Sign-in Identifier — Email or Username. Then password, or Google Sign-in."

> **Dev:** "Can `/` stay a public landing with Sign in / Sign up in the header?"
> **Domain expert:** "No. The Auth Gate owns Whiteboard. No Session means Sign-in. The Marketing Site is the public page."

## Flagged ambiguities

- "both the apps" was used to mean both products — resolved: **Whiteboard** (authenticated) and **Marketing Site** (public). They share visual identity; only Whiteboard owns authentication.
- "login / signup / forget-password" were used as screen names — resolved: **Sign-in Flow** (`/login`), **Sign-up Flow** (`/signup`), **Password Reset Flow** (`/forgot-password`).
- Sign-in is not email-only: **Google Sign-in** is in, and “Email(username)” is the **Sign-in Identifier** — one field that accepts **Email** or **Username**.
- Sign-up “username, phone as well” — resolved: password Sign-up is **Username**, **Email**, **Phone**, password; first/last name are not collected. **Phone** is Sign-up only.
- Post-submit Sign-up verification — resolved: **Email Verification** only. **Phone Verification** deferred to [issue #2](https://github.com/white-board-io/white-board-v3/issues/2).
- Sign-in second factor — resolved: **Second-Factor Verification** is part of the Sign-in Flow.
- Whiteboard `/` is not a public landing — resolved: **Auth Gate**. Post-auth destination is `/` (**In-app Home**), not v2's `/discover`.
- **Google Sign-in** placement — resolved: below the password submit button, not above the fields.
