---
title: Construction Management — Attendance Check-In
docs: ../README.md
created: 2026-11-14
status: ready (the owner answered the ten questions on 2026-11-14, see ADR CM-0043)
status_values:
  - todo
  - in_progress
  - blocked
  - done
---

# Attendance Check-In

The owner asked for one feature (2026-11-14). Under a Project's **Attendance**, beside Labour and Vendor, a **Check-In** entry:

1. A large search box. Under it the Project's **Site Engineers**, **Labours** and **Vendors**, each group open. Typing a name, a role, an ID or a phone number filters them.
2. Opening a person takes the whole window: turn on the camera, see the live picture, the time (read-only), and choose **Check In** or **Check Out**. The photo is taken when the entry is submitted. The location is saved when the browser gives one.
3. A person checks in and out several times a day. Every entry is logged against them.

Decisions and their reasons are in [ADR CM-0043](../adr/CM-0043-site-check-in.md). Read it first, then [CM-0011](../adr/CM-0011-attendance-check-in-out-and-working-hours.md) (times on a Labour's day), [CM-0004](../adr/CM-0004-ledger-first-balances.md) (a marked day posts to the ledger), [CM-0020](../adr/CM-0020-project-sidebar-menu.md) §3 (the Attendance submenu), [CM-0041](../adr/CM-0041-labour-site-engineers-come-from-the-project.md) (Site Engineers on a Project) and `modules/08`.

## 1. What exists today

| Thing               | Today                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Labour attendance   | One live row per Labour per Project per day (`labour_attendance`): a status that prices the day, one typed In, one typed Out, a break in minutes, overtime lines. Marked on a sheet.     |
| Vendor attendance   | A headcount per shift and Labour Category per day. Names nobody.                                                                                                                         |
| Site Engineers      | A row in Masters plus a sign-in. On a Project when their sign-in is. May use HRMS check-in on their own phone.                                                                           |
| Photos              | A Labour and a Vendor may have a photo on their record (`photo_key`), stored privately and recorded in `stored_files`.                                                                   |
| Location            | HRMS keeps one Site fence per Project (`construction_hrms.branches`, kind `project_site`) and compares a member's own check-in with it. Nothing in Labour attendance records a location. |
| The Attendance menu | Folds out into Labour and Vendor (`ATTENDANCE_TABS`). Opening Attendance lands on Labour.                                                                                                |
| Permission          | `labour.attendance` (create, read, update, delete, print, report), checked on the Project.                                                                                               |

## 2. Requirements

### 2.1 The menu

- Attendance folds out into **Check-In**, **Labour**, **Vendor**, in that order. Opening Attendance lands on Check-In.
- Check-In shows for a member with Attendance Read on the Project, like the other two.

### 2.2 Find a person — `/app/projects/<id>/attendance/check-in`

- The page fills the content area: a heading, a **Log** button, one large search box (focused on arrival), and three groups under it: **Site Engineers**, **Labours**, **Vendors**. Each group has a header with its name and counts ("Labours · 42 · 31 in") and folds; all three start open.
- Who is listed:
  - Labours who are active and on the Project today.
  - Site Engineers who are enabled and on the Project (their sign-in is).
  - Vendors who are active and assigned to the Project.
- A person shows: initials, name, role (the Labour Category, "Site Engineer", or "Vendor"), ID (Labour Id, or the Site Engineer's employee code; none for a Vendor), phone, and today's state: **In since 10:02 am**, **Out since 1:05 pm**, or nothing yet.
- The search filters all three groups as the operator types, on name, role, ID and phone. Phone matches on digits only, any part of the number from three digits up, so spaces, "+91" and a leading zero do not matter. A group with no match shows "No match" in one line; when nothing matches anywhere, one empty state says so and offers to clear the search.
- A group with nobody on the Project says so and, for a member who may open Teams, links to the Project's **Teams** page.
- The list refreshes when the page regains focus and every minute, so states stay true on a device left open.
- Without Attendance Create, the list is read-only: people do not open the capture screen, and a line says the member's Role cannot check people in.
- Phone width: one column of large rows, the search box sticks to the top.

### 2.3 Capture — `/app/projects/<id>/attendance/check-in/<kind>/<personId>`

`<kind>` is `labour`, `site-engineer` or `vendor`.

- The screen covers the whole window, over the sidebar and header, in both menu layouts (ADR CM-0039). **Back** (top left) returns to the search with the typed text kept.
- Top: the person's name, role, ID and phone, and their photo from their record when they have one (Labours and Vendors), so the operator can compare.
- **Camera.** A dark panel with **Turn on camera**. After that, the live picture. A browser that already allows the camera for the app starts it without the button, so the second person of the morning needs one tap fewer. A **Switch camera** button when the device has more than one; the rear camera is the first choice. The picture is not mirrored for the rear camera and is mirrored for the front one (the saved photo is never mirrored).
  - Permission refused, no camera, or the camera in use by another app: the panel says which, in one sentence, with **Try again**. Submitting stays disabled: a photo is required.
  - The camera stops when the screen is left or the tab is hidden, and starts again when it is back.
- **Time.** A read-only clock in the Company's time zone, set from the server's time (so a wrong device clock does not mislead), ticking each second, with the date.
- **Check In / Check Out.** A select with the two choices, defaulting to **Check Out** when the person is in and **Check In** otherwise. Under it, in one line, why: "In since 10:02 am" or "Not checked in today".
- **Location.** Asked for with the operator's first tap (**Turn on camera**, or **Use location** on the line itself), and at once only when the browser has already answered for the app, so no permission prompt appears before the operator acts. One line shows the state: not on yet, finding it, found ("Location found (± 12 m)", and which Site fence it will be checked against), or not available with the reason and **Try again**. Inside or outside the fence is known from the saved entry and shows on the confirmation and in today's entries. No location never blocks submitting.
- **Today.** The person's entries of today, oldest first: "Check In 10:02 am", "Check Out 1:05 pm", each with its small photo.
- A line under the camera: "A photo and this device's location are saved with the entry."
- **Submit** (labelled with the chosen action, "Check In" or "Check Out") takes the photo from the live picture at that moment and sends it with the entry. While it sends, the picture freezes on the frame taken and the button shows progress.
- **After.** A confirmation covers the screen: the photo taken, "Checked in at 10:02 am" (or "Checked out at…"), the person's name, and any note from the server (see 2.5). It returns to the search after 4 seconds or on a tap, with the search box emptied and focused.
- **Refusals** show on the screen without leaving it, in the server's words: already checked in, not checked in, the person is no longer on the Project, the photo is too large. A network failure keeps the frame and offers **Try again**.

### 2.4 The log — `/app/projects/<id>/attendance/check-in/log`

- A day's entries (today by default; a date picker, no future dates), newest first, 50 at a time with **Load more**.
- Filters: the kind of person (All, Site Engineers, Labours, Vendors) and a search on the name. Both in the address.
- A row: the photo (small; opens large), the person, role, **Check In** or **Check Out**, the time, the location ("Inside the site fence", "240 m outside the site fence", "Location saved", "No location") with **Open in Maps** when there is one, who recorded it, and a **Voided** mark with the reason when it was.
- **Void** on a row (Attendance Delete) asks for a reason (required, at most 200 characters) and confirms what it does to a Labour's day when it does anything (see 2.5).
- After 90 days a row shows "Photo removed" in place of the photo.

### 2.5 What an entry does

The full rules are in ADR CM-0043 §2–§4. In short:

- The time is the server's. A Check-In belongs to today (Company time); a Check-Out belongs to the day of the Check-In it closes.
- A person is **in** when their last live entry is a Check-In less than 16 hours old.
- Check In while in → `ALREADY_CHECKED_IN`. Check Out while not in → `NOT_CHECKED_IN`. The same action within 2 minutes → the earlier entry is returned, `repeated: true`, nothing is written.
- **A Labour's entry** writes their attendance day on the Project in the same transaction:
  - no day yet → created **Present**, with In from the first Check-In, priced and posted to the ledger;
  - Present or Half Day whose times came from Check-In (or has none) → In, Out and break are worked out again from the entries;
  - times typed on the sheet → left alone, and the answer carries the note "The times typed on the attendance sheet were kept.";
  - Absent, On Leave or Holiday → left alone, with the note "Marked _status_ on the attendance sheet. Change it there if that is wrong."
- **Break** = the gaps between a Check-Out and the next Check-In. No gap → 60 minutes when In to Out is longer than an hour, else 0.
- **Void**: the entry is struck out and the Labour's day is worked out again. Voiding the only entry of a day that Check-In created clears the day (the wage is reversed).
- **A Vendor's or a Site Engineer's entry** is logged and changes nothing else.

### 2.6 The marking sheet

- A Labour's row whose times follow the log shows "From Check-In" under the In and Out boxes. Typing a different time removes it after saving.
- Nothing else on the sheet changes: a day created by Check-In is a marked day like any other.

### 2.7 In the Activity feeds

Each check-in entry is also an entry of its own in the Labour's Activity and the Project's Activity, with the photo, the location and Open in Maps, to viewers with Attendance Read on its Project. Both feeds gain a Check-In filter. See ADR CM-0044.

## 3. API

All under `/api/construction/labour/attendance/check-ins`, checked against `labour.attendance` on the Project. Models are in `check-in-models.ts` beside the routes.

| Route                                    | Needs  | Does                                                                                                         |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `GET /people?projectId=`                 | Read   | The three groups with each person's state today, the server's time, the time zone, and the Site fence's name |
| `GET /?projectId=&date=&kind=&q=&cursor` | Read   | A day's entries, newest first                                                                                |
| `GET /person?projectId=&kind=&personId=` | Read   | One person, their state and today's entries (the capture screen)                                             |
| `POST /`                                 | Create | Records an entry: `projectId`, `kind`, `personId`, `action`, `photo` (base64 JPEG), optional location        |
| `POST /{id}/void`                        | Delete | Voids an entry with a `reason`                                                                               |
| `GET /{id}/photo`                        | Read   | The entry's photo                                                                                            |
| `GET /people/{kind}/{personId}/photo`    | Read   | The Labour's or Vendor's photo from their record (404 when none)                                             |

A member who is not on the Project is refused (403), as on every Project route.

## 4. Not in this round

- Comparing faces. The photo is for a person to look at.
- A locked kiosk a worker uses alone.
- Offline capture. With no signal, attendance is marked on the sheet.
- Naming a Vendor's workers; a Vendor's entry changes no headcount.
- Writing a Site Engineer's entry into HRMS attendance.
- Refusing an entry outside the Site fence, or sending it for approval.
- A report or export of the log (the company backup includes it).
- A Check-In section on the Project Dashboard.

## 5. Notes for the implementer

- The entry and the Labour's day are one transaction. Reuse the day's pricing (`priceDay`) and the store's save and clear, so the ledger and the audit trail are written exactly as the sheet writes them.
- Serialise a person's entries with `pg_advisory_xact_lock` on the person's id before reading their last entry.
- The photo travels in the JSON body as base64, so there is one request and no multipart. Decode and check it as an image by content (`checkImage`), at most 1 MB; never trust the declared type.
- No Zod `.transform` or `.preprocess` in a Request model: `next build` turns the models into the OpenAPI document and fails on a transform.
- The capture screen must release the camera (stop every track) on unmount, on navigating away and when the tab is hidden.
- Storybook cannot open a camera: the camera sits behind a small hook (`useCamera`) that stories replace with a fake that draws a still frame.
- The `AppShell` has two layouts, each with its own `<main>` (ADR CM-0039). The capture screen is `position: fixed` over the whole window, so it does not depend on either.
- Times on screen are the Company's time zone, 12-hour with am/pm, as on the Labour sheet.

## 6. Tickets

Work top to bottom. One PR.

| #   | Title                                                             | Status | Blocked by | Area        |
| --- | ----------------------------------------------------------------- | ------ | ---------- | ----------- |
| 1   | ADR CM-0043, this PRD, glossary and module spec                   | done   |            | Docs        |
| 2   | Table, columns and the rules of an entry                          | done   | 1          | Data+Domain |
| 3   | Record and void an entry; a Labour's day follows                  | done   | 2          | Domain+HTTP |
| 4   | People, person, log and photo reads                               | done   | 2          | HTTP        |
| 5   | Photo retention, company backup and deletion                      | done   | 3          | Data        |
| 6   | Menu entry and the find screen                                    | done   | 4          | UI          |
| 7   | Capture screen: camera, time, location, submit                    | done   | 3, 4       | UI          |
| 8   | Log screen and Void                                               | done   | 3, 4       | UI          |
| 9   | "From Check-In" on the marking sheet                              | done   | 3          | UI          |
| 10  | End-to-end test, browser walkthrough in both layouts, screenshots | done   | 6, 7, 8    | Test        |

### 2 — Table, columns and the rules of an entry

**Done when:** the migration adds `construction_labour.check_in_events` and the two `labour_attendance` columns; the domain has pure, unit-tested functions for a person's state, the decision on a new entry (record, repeat, refuse), a Labour's In, Out and break from their entries, what happens to the day (ADR §3's table), and the Site fence comparison.

### 3 — Record and void an entry

**Done when:**

- `POST /check-ins` records an entry with its photo for each kind of person, with every refusal: person not found, inactive or disabled, not on the Project, `ALREADY_CHECKED_IN`, `NOT_CHECKED_IN`, photo missing, not an image, or too large.
- A repeat within 2 minutes returns the earlier entry and stores no photo.
- A Labour's day is created, updated or left alone exactly as ADR §3 says, with the ledger entries to match; two requests at once for the same Labour produce one Check-In and one refusal.
- `POST /check-ins/{id}/void` voids, works the day out again, and clears a day Check-In created when its last entry goes.
- Marking a day on the sheet turns `from_check_in` off and keeps `times_from_check_in` only when the times are sent back unchanged.
- HTTP tests cover each line above, a member not on the Project and no Create or no Delete (403).

### 4 — Reads

**Done when:** the people, person, log and both photo routes answer as §3 says, the log pages by cursor, a voided entry does not count toward a person's state, and each route is in the OpenAPI document.

### 5 — Retention, backup, deletion

**Done when:** a daily job removes photos older than 90 days (storage, `stored_files`, `photo_removed_at`) and is tested with a clock; the company backup has a Check-In log sheet; deleting a Company removes the entries and their photos.

### 6–9 — Screens

**Done when:** each screen in §2 has Storybook stories with play functions for its states (loading, empty, no match, read-only, camera refused, location refused, each refusal, the confirmation, void), passes at 375 px wide, and both themes look right.

### 10 — End to end

**Done when:** one Playwright spec, with Chromium's fake camera and a granted location, checks a Labour in and out and sees the day on the marking sheet; the feature has been walked through in a production build in both menu layouts; screenshots are in `docs/prd/handoff/screens/attendance-check-in/`.
