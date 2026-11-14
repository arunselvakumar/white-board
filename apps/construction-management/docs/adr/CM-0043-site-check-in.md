# CM-0043 — Check-In on a Project: a photo log for Labours, Site Engineers and Vendors, and what it does to a Labour's day

- Status: accepted (2026-11-14, the owner's answers to ten questions)
- Date: 2026-11-14
- PRD: [Attendance Check-In](../prd/attendance-check-in.md)
- Amends: [CM-0011](CM-0011-attendance-check-in-out-and-working-hours.md) ("Times are typed by the supervisor. There is no biometric or geo check-in"; a day's break is one typed number), [CM-0020](CM-0020-project-sidebar-menu.md) §3 (Attendance folds out into Labour and Vendor), `CONTEXT.md` ("check-in" was an HRMS word only)
- Relates to: [CM-0004](CM-0004-ledger-first-balances.md) (a marked day posts to the ledger), [CM-0012](CM-0012-hrms-product-decisions.md) (HRMS check-in, Site fences), [CM-0033](CM-0033-one-page-staff-no-designations-labours-on-many-projects.md) §4 (Labours on many Projects), [CM-0038](CM-0038-project-staffing-and-activity-feeds.md) §3 and [CM-0041](CM-0041-labour-site-engineers-come-from-the-project.md) (Site Engineers on a Project), [CM-0001](CM-0001-app-and-schemas.md) (private files), [CM-0024](CM-0024-new-menus-reach-existing-designations.md) (new menus and existing Roles)

The owner asked for a **Check-In** entry under a Project's Attendance. Whoever holds the phone or tablet finds a Labour, a Site Engineer or a Vendor of that Project in a large search box, opens them, turns on the camera, chooses Check-In or Check-Out, and submits. The photo is taken at the moment of submitting, with the time and the location. A person checks in and out several times a day (in at 10, out for lunch, back in, out at 5), and every one of those must be logged against them.

Three registers already exist and each works differently:

- **Labour attendance** is one status per Labour per Project per day, with one typed In, one typed Out and a break in minutes (CM-0011). The status prices the day into the wage ledger (CM-0004).
- **Vendor attendance** is a headcount per shift and Labour Category. It names nobody.
- **HRMS attendance** is a Team Member checking in on their own phone, with a location and a Site fence per Project (CM-0012). A Site Engineer has a sign-in, so they can already use it. It has no photo.

## Questions the owner answered

The owner accepted the recommended answer to each question on 2026-11-14.

| #   | Question                                          | Answer                                                                                                                                                                                             |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Who holds the device?                             | A signed-in member (a Site Engineer or supervisor) on a phone or tablet. The rear camera by default, with a switch for the front one. No device lock in this round.                                |
| 2   | Does a Labour's first Check-In mark them Present? | Yes. It creates the day as Present on this Project and posts the wage. The marking sheet can still change it to Half Day or Absent.                                                                |
| 3   | How is the break worked out?                      | From the real gaps between a Check-Out and the next Check-In. With no gap recorded, the 60-minute default of CM-0011 stays, so a straight 9-to-6 day does not earn an hour of overtime.            |
| 4   | What does a Vendor's check-in mean?               | The Vendor (the gang's leader) arriving: a log entry with a photo and a time. It changes no headcount and no pay. Naming each of a Vendor's workers is a separate, larger feature.                 |
| 5   | A Site Engineer: this log, or an HRMS entry?      | This log only, in this round. A Company that also uses HRMS has two records for the same person until the two are joined.                                                                          |
| 6   | Is the photo required?                            | Yes, with no bypass. If the camera fails, the marking sheet is the fallback. Photos are private, small, count toward the plan's storage, and are kept 90 days.                                     |
| 7   | Is the location required?                         | No. It is recorded when the browser gives one and compared with the Project's Site fence: **Outside fence** is flagged, never refused.                                                             |
| 8   | How is a mistake fixed?                           | An entry is never edited. A wrong one is voided with a reason. Times typed on the marking sheet win over the log.                                                                                  |
| 9   | Which permission?                                 | The existing **Attendance** row (`labour.attendance`): Create to check people in, Read to see the list and the log, Delete to void. No new row, so nothing to grant to existing Roles.             |
| 10  | What order must a person's entries follow?        | The choice defaults to the opposite of the person's last entry. A Check-Out with no open Check-In is refused, as is a second Check-In. The same action repeated within two minutes writes nothing. |

## Decision

### 1. One log for the three kinds of people: `construction_labour.check_in_events`

A **check-in entry** is one row: the Project, who (`person_kind`: `labour`, `vendor` or `site_engineer`, and the id), the action (`check_in` or `check_out`), the instant on the server's clock, the attendance day it belongs to, the photo, the location if there was one, and who recorded it.

- It lives in the labour context, with Labour and Vendor attendance, under the same menu. A Site Engineer is named by the id of their Site Engineer row (`construction_masters.supervisors`), read through the context's `SupervisorDirectory` like every other use.
- Rows are append-only. A void sets `voided_at`, `voided_by` and `void_reason`; nothing else on a row changes, except that the retention job (§6) removes the photo.
- **The time is the server's.** The screen shows a clock, read-only, set from the server's time; the entry stores the instant the request arrived.
- **The attendance day** of a Check-In is today in the Company's time zone. A Check-Out belongs to the day of the Check-In it closes, so a night shift that ends after midnight stays on the day it started (CM-0011 reads an Out at or before the In as the next day).

### 2. The order of a person's entries

Per person and Project, from the person's live (not voided) entries:

- A person is **in** when their last entry is a Check-In made less than **16 hours** ago. Otherwise they are **out** (or have no entry today).
- **Check-In** while in: refused, `ALREADY_CHECKED_IN`. **Check-Out** while not in: refused, `NOT_CHECKED_IN`.
- **The same action again within 2 minutes** (a double tap, a second device) writes nothing and answers with the entry already there (`repeated: true`). The new photo is not stored.
- **A forgotten Check-Out.** After 16 hours the Check-In no longer counts as open: the next action is a new Check-In, and the earlier day keeps its In with no Out, exactly as a day with only a check-in typed on the sheet (CM-0011). The supervisor types the Out on the marking sheet. Sixteen hours covers a 12-hour watchman's shift with overtime; a longer one closes on the sheet.
- Entries of one person are serialised in the database (a transaction-scoped advisory lock on the person), so two devices cannot both write "the first Check-In".

### 3. A Labour's entries write their attendance day

In the same transaction as the entry (or the void), the Labour's day on that Project is worked out again from their live entries of that attendance day:

- **In** is the time of the first Check-In. **Out** is the time of the last Check-Out when that is the last entry; while the Labour is in, there is no Out.
- **Break** is the sum of the gaps between a Check-Out and the next Check-In, in whole minutes, at most 720. With no gap, it is the 60-minute default when In to Out is longer than 60 minutes, and 0 otherwise. It is always shorter than In to Out.
- Times are `HH:MM` in the Company's time zone, like typed ones.

What happens to the day:

| The day before the entry                                       | After                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Not marked                                                     | Created **Present** with the times, priced from the Labour's current wage and posted to the ledger, with one overtime line from the times (CM-0011) in the Labour's Labour Category. |
| Present or Half Day, times from Check-In or none               | The times are replaced. Status, shift, Paid Leave and the overtime lines stay; the line from the times follows the new times.                                                        |
| Present or Half Day, times typed on the sheet                  | Unchanged. The entry is logged; the answer says the sheet's times were kept.                                                                                                         |
| Absent, On Leave or Holiday                                    | Unchanged. The entry is logged; the answer says how the day is marked, so the operator can change it on the sheet.                                                                   |
| (void) the Labour's last live entry, on a day Check-In created | The day is cleared (tombstoned, its ledger entries reversed), as Clear does on the sheet. A Labour checked in by mistake is not paid.                                                |
| (void) the last live entry, on a day the sheet has saved       | The times that came from Check-In are removed. The status stays.                                                                                                                     |

Two columns on `labour_attendance` carry this:

- `from_check_in`: the day exists because of a Check-In and the sheet has not saved it since.
- `times_from_check_in`: the day's times follow the log.

Marking the day on the sheet (or Mark Paid Leave) sets `from_check_in` false. It keeps `times_from_check_in` only when it sends back the same In, Out and break; typing different times turns it off, and the log no longer touches that day's times.

A day written this way is the operator's doing with **Attendance Create** alone: it does not need Update, and the Back-dated Entry check does not apply, because the day is today (or the night shift that began yesterday). It is priced like any re-marked day, from the Labour's current wage. The Labour must be active and on the Project that day, as on the sheet.

The overtime line from the times is added only when the day has no overtime lines or already has that line. A day whose overtime the supervisor typed by hand keeps exactly those lines.

### 4. A Vendor's and a Site Engineer's entries are a log only

- A Vendor's entry records that the Vendor was at the site. Vendor attendance stays a headcount per shift and Labour Category, typed on the Vendor page. The Vendor must be active and assigned to the Project.
- A Site Engineer's entry records that they were at the site. It writes no HRMS attendance entry and has no effect on salary. They must be enabled and on the Project (their sign-in is, CM-0038 §3); one without a sign-in is on no Project and is not listed.
- Both show in the Check-In log with their photo, time and location.

### 5. Location is recorded and compared, never required

- The browser's location (latitude, longitude, accuracy in metres) is stored with the entry when the person holding the device allows it. No location is not an error.
- With a location and a Site fence on the Project (HRMS Branches & Sites, CM-0012), the entry is marked **inside** or **outside**, with the metres outside. The rule is the HRMS one: inside when the distance to the centre is at most the radius plus the reported accuracy, the accuracy counting for at most 50 m. No fence, or no location, leaves it unmarked.
- An entry outside the fence is accepted and flagged. Nothing waits for approval. HRMS Settings' GPS requirement does not apply here: it governs a member's own HRMS check-in.
- The labour context reads the Project's Site fence through a port (`SiteFenceDirectory`), a plain read of the HRMS table. The haversine distance moves to the shared kernel (`src/shared-kernel/geo.ts`) so both contexts use one.

### 6. The photo

- Captured in the browser from the live camera at the moment of submitting: a JPEG, at most 1,280 px on its longer side and at most 1 MB. It is sent with the entry in one request, so an entry never exists without its photo.
- Stored privately under the Company's prefix (`check-in-photos`), recorded in `stored_files` (kind `check_in_photo`) in the entry's transaction, so it counts toward the plan's storage. It is served only through the app, to members with Attendance Read on the Project.
- **Kept 90 days.** A daily job deletes older photos from storage, tombstones their `stored_files` rows and sets `photo_removed_at` on the entry. The entry, its time and its location stay.
- A photo is evidence a person can look at. Nothing compares faces.
- The capture screen shows the Labour's or Vendor's photo from their record beside the camera, when there is one, so the operator can see who they are checking in.

### 7. Where it is on screen

- Attendance folds out into **Check-In**, **Labour** and **Vendor**. Opening Attendance lands on Check-In, the first entry (CM-0020 §3).
- **Check-In** (`/app/projects/<id>/attendance/check-in`): a large search box and three groups, all open: Site Engineers, Labours, Vendors. Each person shows their name, role (Labour Category, "Site Engineer" or "Vendor"), ID (Labour Id or employee code), phone and today's state ("In since 10:02", "Out since 1:05", or nothing yet). The search filters on name, role, ID and phone.
- **Capture** (`…/check-in/<kind>/<personId>`) takes the whole window, over the sidebar: the person, the camera, the read-only time, the Check-In / Check-Out choice, the location, and today's entries of that person. After submitting, a confirmation shows for a few seconds and returns to the search. The camera is turned on with a button the first time; once the browser allows it for the app, it starts by itself.
- **Log** (`…/check-in/log`): every entry of a day, newest first, with the photo, the location and who recorded it; **Void** asks for a reason.
- The marking sheet shows "From Check-In" beside times that follow the log.

### 8. Permissions

`labour.attendance` on the Project: **Read** for the list, the log and the photos; **Create** to record an entry; **Delete** to void one. No Permission Matrix row is added, so CM-0024's grant migration has nothing to do. Financial plays no part: no amount is shown or returned.

### 9. Words

- **Check-In** names the screen and the menu entry. **Check In** and **Check Out** are the two actions; **check-in entry** is one row of the **Check-In log**.
- `CONTEXT.md` no longer reserves check-in for HRMS. HRMS keeps "Check in / Check out" for a member's own entry on their own phone; a Project's Check-In is somebody at the site being checked in by the person holding the device.

## Consequences

- One migration in `construction_labour`: the `check_in_events` table with its enums and indexes, and the two columns on `labour_attendance` (both default false, so existing days are unchanged).
- A Check-In can create pay: a Labour checked in is Present and their wage is posted. That is the point of question 2, and it is why voiding the only entry of such a day clears it.
- A Labour's day can now carry a break other than the one somebody typed, and an overtime line whose hours follow real times. A supervisor who disagrees types the times on the sheet; the log then leaves that day's times alone.
- A Site Engineer in a Company that uses HRMS may be asked to check in twice (question 5). Joining the two registers is a later decision.
- Photos of workers and their location are personal data. They are private, shown only to members with Attendance Read on the Project, and removed after 90 days. Telling workers that their photo is taken is the Company's duty; the app shows a line on the capture screen saying a photo and the location will be saved.
- The company backup gains a Check-In log sheet (no photos); deleting a Company removes the entries and their photos with everything else.
- A site with no signal cannot check anyone in. The marking sheet is the fallback until offline capture exists.

## Considered options

- **Several In and Out pairs on the Labour's day itself.** No new table, but the day would need a list of times, every reader of In and Out (the sheet, the Recorded list, the report, the muster roll, overtime from the times) would change, and Vendors and Site Engineers have no day to put them on. Not chosen: the log is new, the day keeps its shape.
- **The log as evidence only, the supervisor still marks Present.** Safer for pay, but the Labour is then recorded twice by two people, which is the work this feature removes (question 2).
- **A Site Engineer's entry written as an HRMS attendance entry.** One register for salary, but HRMS entries are the member's own, carry approvals and a month lock, and have no photo. Left for a later round (question 5).
- **Refusing a Check-In outside the Site fence.** Desktop browsers and phones indoors report locations hundreds of metres off, so honest check-ins would be refused. Flagged instead (question 7).
- **A locked, full-screen kiosk a worker uses alone.** It needs a device lock and a way out of it, and a worker alone can check in a friend. Not asked for: an operator holds the device (question 1).
- **Uploading the photo first, then recording the entry.** Two requests, and a photo with no entry (or an entry with no photo) when the second fails. The photo is small enough to travel with the entry.
