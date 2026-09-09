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

**Onboarding Layout**:
The full-screen shell for Workspace Creation and Workspace Selection. A Session is present; there is no app header and no photo panel. A sign-out action is available so a stuck User can leave. Not Clerk's create-organization or choose-organization widgets.

**Auth Gate**:
The Whiteboard-wide rule that every in-app route requires a Session. Unauthenticated requests are sent to the Sign-in Flow.

**Redirect URL**:
The `?redirect_url=<path>` query on `/login` when the Auth Gate bounces an unauthenticated User. After Sign-in, the Workspace Gate runs first. Once an Active Workspace exists, they go to that path if it is an in-app route (not Sign-in, Sign-up, Password Reset, Workspace Creation, or Workspace Selection). Falls back to the In-app Home.

**In-app Home**:
The Whiteboard screen at `/` a User lands on after a successful auth flow when no Redirect URL is set.

**Workspace**:
The tenant a User belongs to. Realized as a Clerk Organization. A User may belong to many Workspaces. Identified to people by its name.
_Avoid_: organization (in product language), company, tenant, org

**Active Workspace**:
The single Workspace currently in effect for a Session. A User may belong to many Workspaces but has at most one Active Workspace at a time.

**Workspace Gate**:
The Whiteboard-wide rule that the In-app Home requires an Active Workspace. After the Auth Gate confirms a Session: zero Workspaces → Workspace creation; exactly one Workspace and none active → that Workspace is activated; several Workspaces and none active → Workspace Selection; an Active Workspace already set proceeds.

**Workspace Selection**:
The screen at `/select-workspace` where a User with a Session and more than one Workspace, but no Active Workspace, chooses which Workspace to activate.

**Workspace Creation**:
The onboarding screen at `/create-workspace` where a User with a Session and zero Workspaces creates their first Workspace by giving it a name. Not offered once the User already belongs to a Workspace.

**Workspace Owner**:
The User who created a Workspace. There is exactly one per Workspace. In the product they are the Owner; other members are not Owners even if they later have the same access.
_Avoid_: admin, org admin, owner role (as a Clerk slug)

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
- **Workspace Creation** and **Workspace Selection** use the **Onboarding Layout**
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
- After Sign-in, the **Workspace Gate** runs before any **Redirect URL**
- After an **Active Workspace** exists, the **Redirect URL** wins; otherwise the User lands on the **In-app Home**
- A **User** may belong to many **Workspaces**
- A **Session** has at most one **Active Workspace**
- The **Workspace Gate** runs after the **Auth Gate** and before the **In-app Home**
- **Workspace Creation** is only for a User with zero Workspaces
- **Workspace Selection** is only for a User with more than one Workspace and no Active Workspace
- A **Workspace** has exactly one **Workspace Owner**
- The **Workspace Owner** is the User who created that Workspace
- Tenant data is read and written only for the **Active Workspace** on the **Session**. The client does not send which Workspace.
- **User** and **Workspace** identity live in Clerk. Our database stores resource data and references them by Clerk id; it does not copy User or Workspace rows.

## Example dialogue

> **Dev:** "Should the Marketing Site have a Sign-in button that opens Clerk?"
> **Domain expert:** "No. Identity belongs to Whiteboard. The Marketing Site is public — no Session, no Sign-in."

> **Dev:** "Can we keep Clerk's prebuilt SignIn card and just restyle it?"
> **Domain expert:** "No. The Sign-in Flow is a custom Public Layout — split panel, our fields, our errors. Prebuilt Clerk UI is not the Sign-in Flow."

> **Dev:** "Should Sign-in have separate Email and Username boxes?"
> **Domain expert:** "No. One Sign-in Identifier — Email or Username. Then password, or Google Sign-in."

> **Dev:** "Can `/` stay a public landing with Sign in / Sign up in the header?"
> **Domain expert:** "No. The Auth Gate owns Whiteboard. No Session means Sign-in. The Marketing Site is the public page."

> **Dev:** "After Sign-in, do we send them to `/discover`?"
> **Domain expert:** "No. `/` is the In-app Home. They only get there once the Workspace Gate has an Active Workspace."

> **Dev:** "Should we add an `owner` role in Clerk?"
> **Domain expert:** "No. Workspace Owner is the creator. Clerk already makes them the org admin. Don't invent a second slug."

## Flagged ambiguities

- "both the apps" was used to mean both products — resolved: **Whiteboard** (authenticated) and **Marketing Site** (public). They share visual identity; only Whiteboard owns authentication.
- "login / signup / forget-password" were used as screen names — resolved: **Sign-in Flow** (`/login`), **Sign-up Flow** (`/signup`), **Password Reset Flow** (`/forgot-password`).
- Sign-in is not email-only: **Google Sign-in** is in, and “Email(username)” is the **Sign-in Identifier** — one field that accepts **Email** or **Username**.
- Sign-up “username, phone as well” — resolved: password Sign-up is **Username**, **Email**, **Phone**, password; first/last name are not collected. **Phone** is Sign-up only.
- Post-submit Sign-up verification — resolved: **Email Verification** only. **Phone Verification** deferred to [issue #2](https://github.com/white-board-io/white-board-v3/issues/2).
- Sign-in second factor — resolved: **Second-Factor Verification** is part of the Sign-in Flow.
- Whiteboard `/` is not a public landing — resolved: **Auth Gate**. Post-auth destination is `/` (**In-app Home**). In this feature, “/discover” means `/`, not a new route.
- **Google Sign-in** placement — resolved: below the password submit button, not above the fields.
- “organization” in product language — resolved: **Workspace**. Clerk Organization is the backing, not the word Users see.
- “selected workspace” / “log them into that workspace” — resolved: **Active Workspace**. The three-way routing is the **Workspace Gate**.
- “owner role” — resolved: **Workspace Owner** is the creating User, not a custom Clerk role.
- Workspace Creation fields — resolved: **name only**. Type, address, and board are not collected in this slice.
- Creating a second Workspace — resolved: out of scope. **Workspace Creation** is onboarding only (zero Workspaces).
- Creation / Selection chrome — resolved: **Onboarding Layout** (no header, no photos, sign-out available).
- Redirect URL vs Workspace Gate — resolved: **Workspace Gate** always first; **Redirect URL** only after an **Active Workspace** exists.
- Switching Workspaces from the In-app Home — resolved: out of this slice. Tracked in [issue #4](https://github.com/white-board-io/white-board-v3/issues/4).
- Create / select UI — resolved: our **Workspace Creation** and **Workspace Selection** screens only. No Clerk organization widgets.
- “Todo” / “TODO APIs” — resolved: not a product concept. Disposable sample resource for reviewing backend architecture. Do not add to Language. When the first real resource ships, Todo is deleted.
- “todo context” in code — resolved: a sample module under `apps/whiteboard/src/todo` so the modular-monolith template is visible. It is not a product bounded context. Do not add a CONTEXT-MAP.md for it.
- **Auth Gate** vs APIs — resolved: the Auth Gate sends unauthenticated _browser_ routes to the **Sign-in Flow**. HTTP APIs that need a **Session** do not enter Sign-in; they fail closed. `/api/docs` is the documented unauthenticated exception.
- “workspace id in the API body” — resolved: tenant is the **Active Workspace** on the **Session**, not a request field. No Session → 401. Session without Active Workspace → 403.
- “User / Workspace tables in Postgres” — resolved: do not copy them. Resource rows hold Clerk ids. Clerk stays the store for people and tenants.
