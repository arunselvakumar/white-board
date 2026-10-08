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
An authenticated session for a User, present only inside Whiteboard. Whiteboard issues and stores it (ADR-0034).

**Sign-in Flow**:
The custom authentication flow at `/login` that produces a Session. Password Sign-in is Sign-in Identifier + password — or Google Sign-in. A User whose Email is not yet verified completes Email Verification first.
_Avoid_: login, sign-in page

**Sign-up Flow**:
The custom account-creation flow at `/signup` that produces a User. Password Sign-up is two in-page steps: Username, Email, and password, then Email Verification — or Google Sign-in.
_Avoid_: signup, register

**Password Reset Flow**:
The custom self-service flow at `/forgot-password` that lets a User set a new password.
_Avoid_: forget-password, forgot password flow

**Public Layout**:
The full-screen split-panel shell used only by the Sign-in, Sign-up, and Password Reset Flows. It has no authenticated chrome.

**Onboarding Layout**:
The full-screen shell for Workspace Creation and Workspace Selection. A Session is present; there is no app header and no photo panel. A sign-out action is available so a stuck User can leave.

**Auth Gate**:
The Whiteboard-wide rule that every in-app route requires a Session. Unauthenticated requests are sent to the Sign-in Flow.

**Redirect URL**:
The `?redirect_url=<path>` query on `/login` when the Auth Gate bounces an unauthenticated User. After Sign-in, the Workspace Gate runs first. Once an Active Workspace exists, they go to that path if it is an in-app route (not Sign-in, Sign-up, Password Reset, Workspace Creation, or Workspace Selection). Falls back to the In-app Home.

**In-app Home**:
The Whiteboard screen at `/` a User lands on after a successful auth flow when no Redirect URL is set. For a Training Institute Workspace this is the **Owner Dashboard**.

**Workspace**:
The tenant a User belongs to. Stored in `identity.workspaces`. A User may belong to many Workspaces. Identified to people by its name.
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
The kind of educational body a Workspace represents. Chosen at Workspace Creation. Values: School, Preschool, College, University, Training Institute, Other. Only **Training Institute** is available today; it is the default. The other values are coming soon and cannot be selected. Stored on the Workspace and cannot be changed after Workspace Creation.
_Avoid_: education type, organization type, workspace type, category

**Workspace Owner**:
The User who created a Workspace. There is exactly one per Workspace. In the product they are the Owner; other members are not Owners even if they later have the same access.
_Avoid_: admin, org admin

**Training Institute**:
The Institution Type Whiteboard sells today. A Workspace of this type is a computer education centre, home tuition centre, skill centre, or similar — not a School or College.
_Avoid_: academy (as the type name), coaching (as the type name), institute ERP

**Bounded Context**:
One Institution Type's product inside Whiteboard, with its own words and rules. Today there is one: **Training Institute**. A future School context has its own Student, separate from a Training Institute Student. Each Bounded Context has one code folder (`src/training-institute`), one Postgres schema (`training_institute`), one API path prefix (`/api/training-institute`), and one name prefix for Prisma models and OpenAPI components (`TrainingInstitute…`). See ADR-0030.
_Avoid_: module, product line, tenant type (in code comments)

**Student**:
A learner at the Training Institute. A Workspace-scoped record, distinct from a User. Creating a Student is admitting them. A Student with an email address is invited to the Workspace with role `student`. Enquiries are separate until converted.
_Avoid_: pupil, scholar, user, account, child (as the entity name)

**Guardian**:
An additional contact named on a Student, such as a grandparent. A Student may have multiple Guardians, each with a relationship and contact details on the Student record. Father and mother details are also stored on the Student. A father, mother, or Guardian with an email address is invited to the Workspace with role `parent`.
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

**Calendar**:
A read-only view of Classes from recurring weekly Timings, with Class Changes and Holidays applied. The Owner sees open Batches in the Active Workspace; a Teacher sees assigned open Batches; both also see Student-specific Classes for home tuition. A Student or Parent sees active Enrollments linked through their verified Email. Day, week, and month views are available. Upcoming changes for the next 14 days are listed at the top.

**Class**:
One meeting of a Batch on a local date at a start time. Weekly Timings produce Classes; there is no stored row per Class. A Student on Student-specific Timings has their own Classes in the Batch.
_Avoid_: session, lecture, period, occurrence (in UI copy)

**Cancelled Class**:
A Class that will not happen, with an optional reason. The Owner or an assigned Teacher cancels it; it can be restored until it starts.
_Avoid_: deleted class, skipped class

**Moved Class**:
A Class moved to another date and/or time. Its original slot shows where it moved; the new slot is marked **Rescheduled**.
_Avoid_: reschedule (as the entity name), make-up class (as the entity name)

**Holiday**:
One date or a date range on which every Class in the Workspace is cancelled. Declared by the Owner, with an optional reason.
_Avoid_: leave, vacation, closure, day off (as the entity name)

**Enrollment**:
The fact that a Student is taking a Course in a Batch, with Class Mode, Timings, and a Fee Plan. A Student may have many Enrollments.
_Avoid_: admission (that is creating the Student), registration, mapping

**Teacher**:
A person who teaches a Batch in a Training Institute Workspace. A Teacher is a Workspace record, distinct from the User who signs in with role `teacher`. Types are Centre Teacher and Visiting Tutor. The Owner assigns Teachers to Batches; a Batch may have several Teachers.

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

**Student Home**:
The In-app Home for a Student User: their next Class, remaining dues per active Enrollment, latest Attendance marks, and ready Class recordings they may download. See ADR-0031.
_Avoid_: student dashboard, student portal

**Parent Home**:
The In-app Home for a Parent User: the Student Home's cards for each Student they are linked to, on one page. A Parent is linked to a Student through a verified email address that matches the Student's father, mother, or Guardian email.
_Avoid_: parent dashboard, family portal

**Enquiry**:
A prospect asking about a Course or subject before admission, recorded by the Owner or a Teacher with a Source, preferred Class Mode and timing, and follow-up history. An Enquiry is not a Student and has no login. Its stage is New, Follow-up due, Demo scheduled, Demo attended, Joined, or Not interested. The Owner converts it into a Student and Enrollment in one step. See ADR-0032.
_Avoid_: lead, prospect record, inquiry

**Demo**:
A free or paid trial class booked for an Enquiry: one date's Class of a Batch (Batch demo) or a one-to-one demo with a chosen Teacher at a chosen date and time. A demo doesn't take a Batch seat, and its fee is separate from course fees.
_Avoid_: trial, demo session, sample class

**Enquiry Source**:
Where an Enquiry came from, such as Phone call, Walk-in, or Referral. Each Workspace keeps its own list; a retired Source stays on past Enquiries.
_Avoid_: channel, lead source, campaign

**Study Material**:
Notes, a link, or files (PDF, JPEG, PNG) the Owner or an assigned Teacher shares with a Batch, optionally for one Class date. Every Student in the Batch and their linked Parents see it, including Students who join later. See ADR-0033.
_Avoid_: resource, content, upload (as the entity name)

**Homework**:
Work set for a Batch after one of its Classes: a title, instructions, optional files, the Class date it follows from, and a due date. It is overdue from the day after the due date until submitted. Homework due before a Student joined is shown to them for reference but isn't owed.
_Avoid_: assignment, task, worksheet (as the entity name)

**Submission**:
A Student's Homework marked done, by the Student or a linked Parent, with an optional note and files. It is Late when first made after the due date. It can be changed or undone until the Owner or a Teacher checks it, optionally with a remark the Student and Parents see.
_Avoid_: hand-in, turn-in, answer

**Test**:
A test the Owner or an assigned Teacher records for a Batch: a name, date, maximum marks, an optional pass mark, and an optional topic or syllabus note. It is for the whole Batch or for one Student in it (a single-student Test, such as a re-test). A Test is a Draft until it is published; only then do the Students on it and their linked Parents see its results. See ADR-0037.
_Avoid_: exam, assessment, quiz (as the entity name)

**Test Result**:
One listed Student's result on a Test: scored with marks (whole or half marks, from 0 to the maximum), absent, or exempt, with an optional remark. With a pass mark, a scored result is a pass or a fail. Changes after publishing are logged with the old and new values, who, and when.
_Avoid_: grade, score card, mark sheet

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
The step where a User confirms their Email by entering the 6-digit code Whiteboard emailed them. Part of the Sign-up Flow, and of joining a Workspace from an invitation. Until this succeeds there is no Session, and Sign-in asks for it again.

**Phone Verification**:
A future Sign-up step that would confirm Phone with an SMS code. Not part of the current Sign-up Flow. Tracked in [issue #2](https://github.com/white-board-io/white-board-v3/issues/2).

## Relationships

- A **User** authenticates only on **Whiteboard**
- A **Session** belongs to exactly one **User**
- The **Marketing Site** never holds a **Session**
- The **Sign-in Flow**, **Sign-up Flow**, and **Password Reset Flow** all use the **Public Layout**
- **Workspace Creation** and **Workspace Selection** use the **Onboarding Layout**
- Completing the **Sign-in Flow** or **Password Reset Flow** produces a **Session**
- Password **Sign-in Flow** requires a verified **Email** before a **Session** exists
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
- **User** and **Workspace** identity live in the `identity` schema (ADR-0034). Other contexts reference them by opaque id and never join to them.
- A **Student** belongs to one **Workspace**. A Student is not a **User**.
- A **Course** belongs to one **Workspace**.
- A **Batch** belongs to one **Course**.
- An **Enrollment** joins one **Student** to one **Course** and one **Batch**, and has one **Fee Plan**.
- A **Teacher** belongs to one **Workspace** and may be assigned to many **Batches**; a **Batch** may have several **Teachers**.
- A **Student** may have many **Enrollments**.
- A **Fee Payment** belongs to one **Fee Plan** and produces one **Receipt**.
- **Class Mode** is set on the **Batch** and may be overridden on the **Enrollment**.
- **Timing** defaults from the **Batch**; **Enrollment** may set Student-specific Timings.
- **Timings** produce **Classes**. A **Class** is a Batch, a date, and a start time.
- A **Class** may be cancelled or moved once; restoring it brings back the original. Changing a **Class** never changes the Batch's weekly **Timings**.
- A **Holiday** belongs to one **Workspace** and cancels every **Class** on its dates.
- The **Owner Dashboard** is the **In-app Home** for a Training Institute **Workspace**.
- The **Student Home** and **Parent Home** are the **In-app Home** for Student and Parent Users. A Student or Parent may download a **Class** recording only from an active **Enrollment**, on or after the date it began.

- **Study Material** and **Homework** belong to one **Batch**. A **Homework** belongs to one of the Batch's **Class** dates.
- A **Submission** belongs to one **Homework** and one **Student**; there is at most one live Submission per Homework and Student.
- A Student who leaves a Batch keeps read access to Study Material and Homework posted while they were enrolled.
- A **Test** belongs to one **Batch**, and a single-student Test to one **Student** in it. A whole-batch Test lists the Batch's Students on its date; a **Test Result** belongs to one Test and one Student. Students and Parents see only the Student's own published Test Results, never another Student's marks or Batch numbers.

## Example dialogue

> **Dev:** "Should the Marketing Site have a Sign-in button?"
> **Domain expert:** "No. Identity belongs to Whiteboard. The Marketing Site is public — no Session, no Sign-in."

> **Dev:** "Can we use an auth library's prebuilt sign-in card and just restyle it?"
> **Domain expert:** "No. The Sign-in Flow is a custom Public Layout — split panel, our fields, our errors."

> **Dev:** "Should Sign-in have separate Email and Username boxes?"
> **Domain expert:** "No. One Sign-in Identifier — Email or Username. Then password, or Google Sign-in."

> **Dev:** "Can `/` stay a public landing with Sign in / Sign up in the header?"
> **Domain expert:** "No. The Auth Gate owns Whiteboard. No Session means Sign-in. The Marketing Site is the public page."

> **Dev:** "After Sign-in, do we send them to `/discover`?"
> **Domain expert:** "No. `/` is the In-app Home. They only get there once the Workspace Gate has an Active Workspace."

> **Dev:** "Can a Workspace have two Owners?"
> **Domain expert:** "No. The Workspace Owner is the creator, with role `owner`. Nobody can be invited as an Owner."

> **Dev:** "Is a Student a User?"
> **Domain expert:** "A Student remains a Workspace record. If they have an email address, invite them as a User with the Student role. Do not replace the Student record with a User."

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
- Sign-in second factor — resolved: none for now. Clerk's new-device code was dropped with Clerk (ADR-0034); optional two-factor is backlog.
- Whiteboard `/` is not a public landing — resolved: **Auth Gate**. Post-auth destination is `/` (**In-app Home**). In this feature, “/discover” means `/`, not a new route.
- **Google Sign-in** placement — resolved: below the password submit button, not above the fields.
- “organization” in product language — resolved: **Workspace**. Better Auth's "organization" is the backing, not the word Users see.
- “selected workspace” / “log them into that workspace” — resolved: **Active Workspace**. The three-way routing is the **Workspace Gate**.
- “owner role” — resolved: **Workspace Owner** is the creating User, with role `owner`.
- Workspace Creation fields — resolved: **name** and **Institution Type**. **Training Institute** is the default and the only selectable value. School, Preschool, College, University, and Other are shown as coming soon. Address and board are not collected in this slice. Institution Type is a column on `identity.workspaces`.
- Creating a second Workspace — resolved: out of scope. **Workspace Creation** is onboarding only (zero Workspaces).
- Creation / Selection chrome — resolved: **Onboarding Layout** (no header, no photos, sign-out available).
- Redirect URL vs Workspace Gate — resolved: **Workspace Gate** always first; **Redirect URL** only after an **Active Workspace** exists.
- Switching Workspaces from the In-app Home — resolved: out of this slice. Tracked in [issue #4](https://github.com/white-board-io/white-board-v3/issues/4).
- Create / select UI — resolved: our **Workspace Creation** and **Workspace Selection** screens only.
- “Todo” / “TODO APIs” — resolved: not a product concept. Disposable sample resource for reviewing backend architecture. Do not add to Language. When the first real resource ships, Todo is deleted.
- “todo context” in code — resolved: a sample module under `apps/whiteboard/src/todo` so the modular-monolith template is visible. It is not a product bounded context. Do not add a CONTEXT-MAP.md for it.
- **Auth Gate** vs APIs — resolved: the Auth Gate sends unauthenticated _browser_ routes to the **Sign-in Flow**. HTTP APIs that need a **Session** do not enter Sign-in; they fail closed. `/api/docs` is the documented unauthenticated exception.
- “workspace id in the API body” — resolved: tenant is the **Active Workspace** on the **Session**, not a request field. No Session → 401. Session without Active Workspace → 403.
- “User / Workspace tables in Postgres” — resolved: they live only in the `identity` schema (ADR-0034, superseding ADR-0018). Resource rows hold their ids as opaque strings.
- First product slice after auth — resolved: **P0** for **Training Institute** only. Replace the paper register: **Student**, **Course**, **Batch**, **Enrollment**, **Fee Plan**, **Fee Payment**, **Receipt**, **Owner Dashboard**. Spec: [docs/prd/training-institute-p0.md](docs/prd/training-institute-p0.md). Tickets: [docs/prd/tasks.md](docs/prd/tasks.md).
- “Student login” — resolved: a **Student** is not a **User**. No Student or Guardian Session in P0.
- Course vs class vs batch — resolved: **Course** is the catalog item; **Batch** is the scheduled run; **Enrollment** is the Student in that run.
- Fees on the Student — resolved: **Fee Plan** is per **Enrollment**. Partial **Fee Payments** allowed. One **Receipt** per payment.
- Online vs offline — resolved: **Class Mode** on the **Batch**, overridable on the **Enrollment**. Hybrid is a valid mode.
- Student-specific hours (home tuition) — resolved: **Timing** on the **Enrollment** may inherit the Batch or be Student-specific.
- Enquiry, attendance, certificates, WhatsApp, GST, live classroom, franchise royalty — resolved: not P0. P1/P2.
- Cancellations, holidays, and moved classes ([issue #13](https://github.com/white-board-io/white-board-v3/issues/13)) — resolved: **Cancelled Class**, **Moved Class**, and **Holiday** are exceptions over weekly **Timings**, not a session calendar. Owner and assigned Teachers change Classes; Holidays are Owner-only and Workspace-wide. See [ADR-0028](docs/adr/0028-class-changes-are-exceptions-over-weekly-timings.md) and [ADR-0029](docs/adr/0029-class-change-product-decisions.md).
