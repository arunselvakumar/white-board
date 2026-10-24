# CM-0029 — Users & Roles: access comes from a Role, and an admin can set a first password

- Status: accepted
- Date: 2026-10-24
- Amends: [CM-0003](CM-0003-permission-matrix.md) (per-member matrix, Designation templates copied), [CM-0002](CM-0002-company-workspace-and-mobile-otp.md) and [CM-0009](CM-0009-email-sign-in-while-sms-is-off.md) (who can sign in, and how), [CM-0024](CM-0024-new-menus-reach-existing-designations.md) (grant migrations now target seeded Roles)
- Relates to: [CM-0028](CM-0028-settings-main-menu.md) (main-menu items)

Team Members sat under Masters → Company, and the last step of Add Team Member was a full Permission Matrix for that one person. The owner wants a **Users & Roles** main-menu item with two pages, **Users** and **Role Management**. What a person may do should be a **Role** that is defined once and given to many Users. A User is the Team Member who can sign in. Email must not be required: site staff without an email sign in with their mobile and a password the admin sets, and must change it the first time they sign in.

The owner answered four questions on 2026-10-24. The answers are the first four decisions below. The rest are defaults chosen for the build.

## Decision

### 1. A Role holds the permissions; a User has exactly one Role, linked

- **Role** (`construction_organization.roles`): a name (unique among live Roles in the Company), an optional description, and a Permission Matrix stored as rows in `role_menu_permissions (role_id, menu, flags)`, the same bitmask as before. Menus and flags stay code (CM-0003).
- **Each Team Member except the Owner has one Role** (`team_members.role_id`). Access is read through the Role on every request. **Editing a Role changes access for everyone on it**, from their next request. There are no per-User overrides: to give one person different access, make a Role for them (Duplicate makes that quick).
- **The Owner has no Role.** They can do everything, as before. HRMS Team Members also have a Role; Add User preselects **HRMS Staff** (the old HRMS default set) when Member Type is HRMS.
- **Designations are job titles only.** The Permission Template leaves Designations (column and form section). Back-dated Entry overrides still name Designations. Choosing a Designation no longer sets access.
- **Grant rules stay.** A Member can give a User a Role, or save a Role, only when they themselves hold every cell in it (`assertCanGrant`). Nobody can change the Role they are on, so a Member cannot widen their own access.
- A Role with Users on it cannot be deleted (`ROLE_IN_USE`); move them first. Seeded Roles can be renamed, edited and deleted like any other.
- A new menu `organization.roles` (Role Management: create, read, update, delete) guards the Role pages and APIs. It is granted to every Role that already had `organization.team_members` update.

### 2. Users & Roles is a main-menu item; Team Members leave Masters

- **Users & Roles** sits in the main menu after Masters, before Settings, with a submenu: **Users** (`/app/users`) and **Role Management** (`/app/roles`). It folds out like Masters and Workspace.
- Masters → Company keeps only **Designations**. `/app/masters/team-members/…` redirects permanently to `/app/users/…`.
- On screens the people list is **Users** ("Add User", "Edit User"). In code, APIs and audit events it stays **Team Member** (`/api/construction/organization/team-members`), which is still the record's name, including for people who cannot sign in.

### 3. Setting a password never touches an existing account

When the admin sets a password, we create the sign-in account only if no User has that mobile or email yet. If one does, the person already uses the product (in another Company, say): we never change their password. They get an ordinary Join Request instead, and the response and the screen say so (`passwordIgnored: "existing_account"`).

### 4. Existing Companies move to Roles without anyone's access changing

The migration `…_construction_organization_roles`:

1. For each Company, makes one Role per Designation that has a Permission Template, with that template and the Designation's name, and adds **HRMS Staff** (the HRMS default set).
2. Puts each Team Member (not the Owner) on the Role whose matrix equals theirs, preferring their own Designation's Role. A member whose matrix matches no Role gets one of their own, **"<name>'s access"**, which the admin can tidy later. Several members with the same unmatched matrix share one such Role.
3. Writes an audit event per Team Member and per Designation with the grants and template it removes, then drops `member_menu_permissions` and `designations.permission_template`.

### 5. Seed Roles for new Companies

`src/organization/infrastructure/seeds/roles.json` replaces the templates in `designations.json`. A new Company gets: **Admin** (every supported cell), **Project Manager**, **Site Engineer**, **Site Supervisor**, **Store Keeper**, **Accountant**, **Quality Control**, **Structural Engineer** (the eight templates the Designation seeds carried) and **HRMS Staff**. From now on a PR that adds a menu or flag grants it to the seeded Roles in a migration (CM-0024's rule, with Roles in place of Designations).

### 6. Add User: email optional, "Invite them", or "Set a password"

The **Sign-in** section of the details step offers three outcomes, chosen by the admin:

- **Invite them** (checkbox, needs an email; on by default when an email is typed): the Team Member is Joining Pending and gets the invitation email and share link, as today.
- **Set a password** (needs a mobile or an email, at least 8 characters): we create the account and the `member` membership at once. The Team Member is **Active** straight away, with no Join Request, and **must change the password the first time they sign in**. Invite them is not offered then.
- **Neither**: the Team Member is a record (Joining Pending, no invitation sent) and can be invited later from Edit User, as before.

Mobile or email is still required, but neither is required on its own. A User created with only a mobile gets the placeholder email `<digits>@mobile.invalid` (CM-0002), which is never shown or mailed. The admin-entered mobile is stored as verified, because the admin vouches for it. Join Requests now match a verified mobile whatever the SMS switch (amending CM-0009, which matched mobiles only while SMS was on), so a mobile-only User whose password another Company tried to set still sees that Company's Join Request.

### 7. Sign in with mobile and password, whatever the SMS switch

- The sign-in screen gets **Email** and **Mobile** tabs. Mobile signs in with mobile number and password through Better Auth's `POST /api/auth/sign-in/phone-number` (`requireVerification: true`, so only a verified mobile works). That endpoint is reachable whether SMS is on or off. While SMS is on, the Mobile tab still offers the OTP code as today.
- A mobile-only User who forgets their password asks the admin. **Set a new password** on Edit User is allowed only when that User belongs to no other Company, so one Company's admin can never reset an account another Company relies on. It also makes them change it on their next sign-in.

### 8. First sign-in forces a new password

`identity.users.must_change_password` (Better Auth `additionalFields`, not writable by the client) is set when an admin sets a password. While it is true:

- every `/app` page redirects to **`/change-password`** (current password, new password, confirm), and the Construction API answers 403 `PASSWORD_CHANGE_REQUIRED` except for sign-out and the session;
- `POST /api/auth/change-password` clears the flag in an after-hook, and so does a password reset by email code. The new password must differ from the temporary one.

## Consequences

- `loadMemberAccess` and the notification-recipient query read the matrix through the Role (`team_members → roles → role_menu_permissions`). The UI hides actions from the same matrix, as before.
- `PUT /team-members/{id}/permissions` is replaced by `PUT /team-members/{id}/role`. Ownership transfer gives the old Owner the **Admin** Role (or every right in a Role made for them, if the Company deleted Admin).
- Test helpers that made a member "with exactly these grants" now make a Role with those grants and put the member on it.
- The audit events for the dropped tables are the record of what was there. Nothing is lost: every member's access is in a Role.

## Considered options

- **Roles plus per-User tweaks:** more flexible, but "who can approve POs?" would need two places checked. The owner chose linked Roles with no overrides.
- **Rename Designations to Roles:** one concept, but job titles and access are different things (two Site Engineers may need different access). Rejected.
- **Overwrite an existing account's password, or refuse:** overwriting lets one Company take over another's User; refusing leaves the admin stuck. A Join Request keeps both safe.
- **Reset everyone to their Designation's template:** simpler migration, but it silently changes what people can do. Rejected by the owner.
- **Better Auth's admin plugin to create Users:** it brings ban, impersonate and list-all-users endpoints we would have to keep closed. A small server-side `createPasswordAccount` in `@repo/auth/construction/server` does the one thing we need.
