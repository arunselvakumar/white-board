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
The custom account-creation flow at `/signup` that produces a User. Password Sign-up is two in-page steps: Username, Email, and password, then Email Verification — or Google Sign-in.
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
The Whiteboard screen at `/` a User lands on after a successful auth flow when no Redirect URL is set. For a Training Institute Workspace this is the **Owner Dashboard**.

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
The onboarding screen at `/create-workspace` where a User with a Session and zero Workspaces creates their first Workspace by giving it a name and an **Institution Type**. Training Institute is selected by default and is the only type that can be chosen. School, Preschool, College, University, and Other are listed as coming soon and cannot be selected. Not offered once the User already belongs to a Workspace.

**Institution Type**:
The kind of educational body a Workspace represents. Chosen at Workspace Creation. Values: School, Preschool, College, University, Training Institute, Other. Only **Training Institute** is available today; it is the default. The other values are coming soon and cannot be selected. Stored on the Clerk Organization as public metadata.
_Avoid_: education type, organization type, workspace type, category

**Workspace Owner**:
The User who created a Workspace. There is exactly one per Workspace. In the product they are the Owner; other members are not Owners even if they later have the same access.
_Avoid_: admin, org admin, owner role (as a Clerk slug)

**Training Institute**:
The Institution Type Whiteboard sells today. A Workspace of this type is a computer education centre, home tuition centre, skill centre, or similar — not a School or College.
_Avoid_: academy (as the type name), coaching (as the type name), institute ERP

**Student**:
A learner at the Training Institute. A Workspace-scoped record, not a User and not a Clerk identity in P0. Creating a Student is admitting them. Enquiry pipeline is P1.
_Avoid_: pupil, scholar, user, account, child (as the entity name)

**Guardian**:
An additional contact named on a Student, such as a grandparent. A Student may have multiple Guardians, each with a relationship and contact details on the Student record. Father and mother details are also stored on the Student. None of these contacts is a User in P0.
_Avoid_: parent as a login, family account

**Course**:
A program the institute offers, such as DCA, Tally, or Python. It has a name, structured expected duration (a number of days, weeks, or months, or Flexible), an optional total learning hours value, and a default fee. Optional catalog details are Course code, category, eligibility, learning outcomes, and syllabus outline. It is not when or where it is taught.
_Avoid_: subject, class, program (as the stored name), paper

**Batch**:
A scheduled run of a Course: default Timings, Class Mode, capacity, optional room. Many Students enroll in one Batch.
_Avoid_: section, period, class (as the entity name)

**Class Mode**:
How teaching is delivered: Offline, Online, or Hybrid. Set on the Batch; an Enrollment may override it.
_Avoid_: medium, channel, delivery type

**Timing**:
When teaching happens. A Batch has default Timings (days of week and clock times). An Enrollment may inherit those or set Student-specific Timings (home tuition).
_Avoid_: timetable (P1 calendar of sessions), period

**Enrollment**:
The fact that a Student is taking a Course in a Batch, with Class Mode, Timings, and a Fee Plan. A Student may have many Enrollments.
_Avoid_: admission (that is creating the Student), registration, mapping

**Fee Plan**:
What a Student owes for one Enrollment: one-time, monthly, or installments, with amounts and due dates. Copied from the Course default at enroll time and then adjustable.
_Avoid_: invoice, fee structure, package (as the entity name)

**Fee Payment**:
Money collected against a Fee Plan. Partial payments are allowed. Method is Cash, UPI, Card, or Other. Recorded by a User in the Active Workspace.
_Avoid_: transaction, collection (as the entity name)

**Receipt**:
The numbered document for one Fee Payment. Printable in P0. Not GST-compliant in P0.
_Avoid_: invoice, bill, voucher

**Owner Dashboard**:
The In-app Home for a Training Institute: active Student count, outstanding dues, today's Batches, recent Students.
_Avoid_: analytics, reports, insights (as the screen name)

**P0**:
The current product slice: replace the paper register. Student, Course, Batch, Enrollment (including Timings and Class Mode), Fee Plan, Fee Payment, Receipt, Owner Dashboard. Not attendance, enquiry CRM, certificates, WhatsApp, or live classroom.

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
The User's mobile number. Optional. Not collected in the current Sign-up Flow. Not a Sign-in Identifier.
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
- Password Sign-up collects **Username**, **Email**, and a password of at least 8 characters
- **Phone** is optional, is not collected at Sign-up, and is not a **Sign-in Identifier**
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
- A **Workspace** has one **Institution Type**
- Workspace Creation can only set **Institution Type** to Training Institute; other values are coming soon
- Tenant data is read and written only for the **Active Workspace** on the **Session**. The client does not send which Workspace.
- **User** and **Workspace** identity live in Clerk. Our database stores resource data and references them by Clerk id; it does not copy User or Workspace rows.
- A **Student** belongs to one **Workspace**. A Student is not a **User**.
- A **Course** belongs to one **Workspace**.
- A **Batch** belongs to one **Course**.
- An **Enrollment** joins one **Student** to one **Course** and one **Batch**, and has one **Fee Plan**.
- A **Student** may have many **Enrollments**.
- A **Fee Payment** belongs to one **Fee Plan** and produces one **Receipt**.
- **Class Mode** is set on the **Batch** and may be overridden on the **Enrollment**.
- **Timing** defaults from the **Batch**; **Enrollment** may set Student-specific Timings.
- The **Owner Dashboard** is the **In-app Home** for a Training Institute **Workspace**.

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

> **Dev:** "Is a Student a User we create in Clerk?"
> **Domain expert:** "No. A Student is a Workspace record. They do not sign in in P0. Users are staff who run the institute."

> **Dev:** "Can Course and Batch be the same thing?"
> **Domain expert:** "No. Course is what is taught. Batch is when, how, and with whom. DCA is a Course; DCA Weekday 9–11 Offline is a Batch."

> **Dev:** "Should fees hang off the Student?"
> **Domain expert:** "No. A Student can take more than one Course. The Fee Plan belongs to the Enrollment."

## Flagged ambiguities

- "both the apps" was used to mean both products — resolved: **Whiteboard** (authenticated) and **Marketing Site** (public). They share visual identity; only Whiteboard owns authentication.
- "login / signup / forget-password" were used as screen names — resolved: **Sign-in Flow** (`/login`), **Sign-up Flow** (`/signup`), **Password Reset Flow** (`/forgot-password`).
- Sign-in is not email-only: **Google Sign-in** is in, and “Email(username)” is the **Sign-in Identifier** — one field that accepts **Email** or **Username**.
- Sign-up “username, phone as well” — resolved: password Sign-up is **Username**, **Email**, and password; first/last name are not collected. **Phone** is optional and not collected in the current Sign-up Flow. **Phone** is not a **Sign-in Identifier**.
- Post-submit Sign-up verification — resolved: **Email Verification** only. **Phone Verification** deferred to [issue #2](https://github.com/white-board-io/white-board-v3/issues/2).
- Sign-in second factor — resolved: **Second-Factor Verification** is part of the Sign-in Flow.
- Whiteboard `/` is not a public landing — resolved: **Auth Gate**. Post-auth destination is `/` (**In-app Home**). In this feature, “/discover” means `/`, not a new route.
- **Google Sign-in** placement — resolved: below the password submit button, not above the fields.
- “organization” in product language — resolved: **Workspace**. Clerk Organization is the backing, not the word Users see.
- “selected workspace” / “log them into that workspace” — resolved: **Active Workspace**. The three-way routing is the **Workspace Gate**.
- “owner role” — resolved: **Workspace Owner** is the creating User, not a custom Clerk role.
- Workspace Creation fields — resolved: **name** and **Institution Type**. **Training Institute** is the default and the only selectable value. School, Preschool, College, University, and Other are shown as coming soon. Address and board are not collected in this slice. Institution Type is Clerk Organization public metadata, not a Postgres Workspace row.
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
- First product slice after auth — resolved: **P0** for **Training Institute** only. Replace the paper register: **Student**, **Course**, **Batch**, **Enrollment**, **Fee Plan**, **Fee Payment**, **Receipt**, **Owner Dashboard**. Spec: [docs/prd/training-institute-p0.md](docs/prd/training-institute-p0.md). Tickets: [docs/prd/tasks.md](docs/prd/tasks.md).
- “Student login” — resolved: a **Student** is not a **User**. No Student or Guardian Session in P0.
- Course vs class vs batch — resolved: **Course** is the catalog item; **Batch** is the scheduled run; **Enrollment** is the Student in that run.
- Fees on the Student — resolved: **Fee Plan** is per **Enrollment**. Partial **Fee Payments** allowed. One **Receipt** per payment.
- Online vs offline — resolved: **Class Mode** on the **Batch**, overridable on the **Enrollment**. Hybrid is a valid mode.
- Student-specific hours (home tuition) — resolved: **Timing** on the **Enrollment** may inherit the Batch or be Student-specific.
- Enquiry, attendance, certificates, WhatsApp, GST, live classroom, franchise royalty — resolved: not P0. P1/P2.
