# CM-0037 — A Site Engineer page with a full profile and a sign-in, and default Roles that stay

- Status: accepted (2026-11-11, the owner's request)
- Date: 2026-11-11
- Amends: [CM-0036](CM-0036-one-staff-group-and-site-engineers.md) §2 (a Site Engineer now signs in), [CM-0030](CM-0030-users-and-roles.md) (seeded Roles could be renamed and deleted like any other)
- Relates to: [CM-0032](CM-0032-staff-and-salary.md) and [CM-0033](CM-0033-one-page-staff-no-designations-labours-on-many-projects.md) §3 (the salary set-up), [CM-0009](CM-0009-email-sign-in-while-sms-is-off.md) (invitations by mobile only while SMS is on), ADR-0030 (one migration per schema), `modules/02`, `modules/08`

The owner asked for two changes:

1. **Add Site Engineer** opened a dialog with a name, a mobile and an optional Team Member. The owner wants a page of its own, like Labour and Vendor, that takes many more details, and wants a Site Engineer to **sign in**, on the default **Site Engineer** Role.
2. The **default Roles** from the seed must not be deletable.

## Questions the owner answered

| Question                                                                                       | Answer                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is a Site Engineer an Office Staff record on the Site Engineer Role, or a record of their own? | **A record of their own, with its own sign-in.** They are not listed on Office Staff.                                                                                                                                                                                                                      |
| Is the sign-in required?                                                                       | **Required** for a new Site Engineer: an invitation, a first password, or both. Older Site Engineers without one stay, and get one when they are next edited.                                                                                                                                              |
| Which details?                                                                                 | **Personal** (father's name, date of birth, gender, blood group, address, emergency contact), **Employment** (employee code, joining date, qualification, years of experience, specialisation), **KYC and pay** (Aadhaar, PAN, salary set-up), **Bank** (account holder, account number, IFSC, bank name). |
| Default Roles keep their name too?                                                             | **Yes.** Delete and rename are locked; the description and Permission Matrix stay editable.                                                                                                                                                                                                                |

## Decision

### 1. A Site Engineer is a Site Engineer record plus a sign-in membership

Signing in, a Role's permissions, the Projects someone may see, invitations, Join Requests, temporary passwords and the plan's staff limit all hang off a Team Member (`construction_organization.team_members`, ADR CM-0002, CM-0030). Building a second sign-in beside it would copy all of that. So a Site Engineer's sign-in **is** a Team Member, but one that belongs to the Site Engineer:

- `team_members.site_engineer` (boolean, default false) marks it. It is always on the default **Site Engineer** Role, a Normal member, and made, changed and removed only from the Site Engineer page.
- **Office Staff leaves these out.** The repository's list skips them unless asked (`includeSiteEngineers`); ownership transfer asks, because a Site Engineer who signs in can still become the Owner.
- `supervisors.team_member_id` points at it, as it pointed at an Office Staff member before.

Each field lives in one place:

| Where                                                         | Fields                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site Engineer row (`construction_masters.supervisors`)        | name, mobile, employee code, father's name, date of birth, gender, blood group, joining date, qualification, years of experience, specialisation, bank account holder, account number (encrypted, last four kept), IFSC, bank name |
| Sign-in membership (`construction_organization.team_members`) | name and mobile (kept the same as the row), email, address, Aadhaar, PAN, emergency contact, salary set-up, Projects, Role, status                                                                                                 |

The membership already validates, encrypts and masks Aadhaar and PAN, and already holds the salary set-up and Projects, so the Site Engineer row adds only what it lacks. The employee code is unique among a Company's live Site Engineers (a partial unique index, `SUPERVISOR_EMPLOYEE_CODE_IN_USE`). Dates are calendar dates; a date of birth is before today and a joining date after it.

### 2. One command across two contexts

`src/composition/site-engineers.ts` (`SiteEngineerHandlers`) runs both contexts' handlers, behind `/api/construction/masters/site-engineers` (list, add, one, update, resend-invite, password, delete). The two contexts write in their own transactions, so:

- Every check that could refuse the Site Engineer row (details, a name or employee code in use, a stale `updatedAt`) runs **before** the sign-in is made or changed.
- If the row write still fails, the sign-in it just made is removed again (record tombstoned, membership ended).
- Delete removes the row first (`SUPERVISOR_IN_USE` while Labours or attendance name them), then takes back the sign-in.

A Site Engineer's sign-in is one of three kinds in the API: `site_engineer` (their own, managed on the page), `office_staff` (linked to an Office Staff member before this ADR; that record is managed on Office Staff and the page changes only the row) and `none` (an older one; saving Edit then needs a sign-in, `SIGN_IN_REQUIRED`).

### 3. Who may do it

The routes check the **Labours** menu (`masters.labours`), as the Site Engineer list always has. Giving a sign-in, or setting a password, also needs every cell of the Site Engineer Role (`CANNOT_GRANT`, ADR CM-0030 §1): nobody can hand out more than they hold. The plan's staff limit applies to the sign-in. Salary and bank details need **Financial** on Labours: without it they are not shown, and an edit keeps them.

Disabling a Site Engineer takes them off the pickers as before; it does not stop their sign-in. Deleting does.

### 4. Default Roles are never deleted or renamed

A seeded Role (`is_seed`) refuses delete (409 `ROLE_IS_DEFAULT`) and a change of name (400 `ROLE_DEFAULT_NAME_LOCKED`). Its description and Permission Matrix are edited like any other, and Duplicate makes a Company Role with another name. Role Management disables Delete with the reason, and Edit Role shows the name read-only. The app finds the **Site Engineer** and **HRMS Staff** Roles by name, so a rename would have broken Add Site Engineer and Add Staff.

A Company that deleted or renamed a default Role before this change keeps what it has. Add Site Engineer then answers 409 `SITE_ENGINEER_ROLE_MISSING`; Ownership transfer already makes a Role with every right when Admin is gone.

## Consequences

- Two migrations, one per schema: the masters profile columns and the organization flag. Every new column is optional, so existing Site Engineers work as they are.
- `/api/construction/masters/supervisors` stays for the pickers and the old fields; an update through it keeps the profile and bank details.
- A Site Engineer's sign-in is not on Office Staff, so their Role cannot be changed there; they are always on the Site Engineer Role. A Company that wants different access edits that Role's matrix.
- Project Resources still lists a Site Engineer's sign-in among the Team Members of a Project, and can add or remove it there.
- The words "Site Engineer" now mean one thing more often: the Site Engineer list and the Site Engineer Role meet in one person.
