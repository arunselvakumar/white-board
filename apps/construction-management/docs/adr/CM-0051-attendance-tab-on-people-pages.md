# CM-0051 — An Attendance tab on the Labour, Site Engineer, Vendor and Office Staff pages

- Status: accepted (2026-11-26, the owner's request)
- Date: 2026-11-26
- Relates to: [CM-0038](CM-0038-project-staffing-and-activity-feeds.md) (the people pages' tabs and who sees which Project), [CM-0043](CM-0043-site-check-in.md) (the Check-In log), [CM-0044](CM-0044-check-ins-in-the-activity-feeds-and-teams-rows-open-profiles.md) (§4: check-in entries need Attendance Read), [CM-0011](CM-0011-attendance-check-in-out-and-working-hours.md) (a Labour day's hours), [CM-0012](CM-0012-hrms-product-decisions.md) (§2: an HRMS day's status)

The owner asked (2026-11-26) for an **Attendance** tab on a Labour's page, a Site Engineer's page and "anyone who deals with attendance": the figures that matter as cards, and a calendar of the days they worked in the style of a contribution graph, where hovering a day shows the Projects they worked at that day and the hours at each.

Until now attendance shows on a person's page only as Activity entries, one per day, newest first. That answers "what happened on the 12th?" but not "how regular is this person?" or "how many hours did they give us this month?".

## Decisions taken with the owner

| Question                                                   | Answer                                                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Which pages get the tab?                                   | All four: Labours, Site Engineers, Vendors and Office Staff.                                                                             |
| A Labour day marked Present or Half Day with no In and Out | Counts the Labour's working hours as marked that day (Half Day: half of them), plus its overtime. The hover says no times were recorded. |
| What period do the cards cover?                            | A month the viewer picks (this month at first), with all-time figures beside them.                                                       |

## Decision

### 1. The tab

- Each of the four pages gains an **Attendance** tab between Details and Activity, kept in the address as `?tab=attendance`, with the picked month as `?month=YYYY-MM`.
- The tab has three parts, top to bottom: the **month's cards**, a one-line **all-time** summary, and the **calendar**.

### 2. The calendar

- One block per month laid out like a wall calendar (Monday first), the blocks side by side, newest on the right. It opens on this month and loads earlier months as the viewer scrolls back (six at a time), stopping at the person's first month: the earliest of their first attendance day, their joining date and the day they were added.
- A day's shade says how much was worked: hours for Labours, Site Engineers and Office Staff (none, under 4, under 8, under 10, 10 or more), and head-days for a Vendor (in quarters of the most in the months shown). Absent, leave and holiday or week-off days get their own marks; days after today are blank; today is ringed.
- Clicking a month's name picks it for the cards.
- **Hovering or focusing a day** shows its date and status, then one line per Project (or HRMS branch) worked at that day: its name and the hours there, with In – Out when recorded, overtime when any, and for a Vendor the headcount (full and half days) and head-days. Each day is also a button with the same text as its label, so the calendar can be read without a mouse.

### 3. How a day is counted

| Who           | Read from                                                       | A day's hours at a Project                                                                                                                                                                         | Day status                                                                                           |
| ------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Labour        | `labour_attendance` (and its overtime)                          | In and Out: Out − In − break (CM-0011). Present without times: the working hours stored on the day; Half Day: half of them. Overtime is the day's overtime hours. Absent, leave and holiday: none. | As marked; On Leave that is paid shows as Paid Leave. Two Projects in one day: the better of the two |
| Site Engineer | `check_in_events` of kind `site_engineer`, voided ones left out | Each Check In to the next Check Out at that Project, added up. A Check In with no Check Out is shown ("No check-out") and adds no hours.                                                           | Present on any day with a Check In. The log has no absences                                          |
| Vendor        | `vendor_attendance` and its lines                               | No hours: the headcount, full days and half days, and head-days (full + half ÷ 2). Overtime is the lines' overtime hours.                                                                          | Present on any day with a headcount. No absences                                                     |
| Office Staff  | HRMS `attendance_entries`                                       | Closed entries that need no approval or are approved, by the branch checked in at (a Project site as its Project; none matched: "No fence matched"). Pending: no hours. Rejected: left out         | The HRMS day status (CM-0012 §2), first day to today. Paid On Leave shows as Paid Leave              |

Site Engineers and Vendors in detail (decided while building them):

- **A Site Engineer's pairs.** Entries are grouped by their stored attendance day, so a night shift's Check Out after midnight stays on the day it began. A second Check In while already in is skipped (the first stands) and a Check Out with no Check In before it is ignored, as in a Labour's day from check-in entries (CM-0043 §3). After In, Out, In the place is open, Out is the last Check Out and only the closed pair adds minutes. Their first day is their earliest live Check In.
- **A Site Engineer's Projects.** A viewer with Labours Read but no Attendance Read on a Project gets the tab with no days there, not a 403, as on the Activity tab.
- **A Vendor's empty saves.** A save may hold only overtime (no full or half heads). A Project-day whose lines add up to no heads supplied nobody, so it is left out with its overtime, and does not count as a day supplied. Two saves at one Project on one day are added together.

Office Staff in detail (decided while building it):

- **Which days.** As in the monthly summary, a joined (active) member has the HRMS status of every day from their first day (joining or added, the earlier) to today, Absent and Week Off included; a member who has not joined or has left has only the days they have entries on. Days after today are never read.
- **Places.** An entry counts at the branch it checked in at: an office branch by its name; a Project site as its Project (two sites of one Project are one place); no fence matched (GPS off, accepted out of fence, a back-dated day or a missed checkout carry no location) as one place named "No fence matched", with the nil id `00000000-0000-0000-0000-000000000000`. A removed branch keeps its name.
- **In and Out** are the first check-in and the last check-out at that place, in Company time; while an entry there is open, Out is empty and the place shows "No check-out". Pending entries show their times, "Awaiting approval" and no hours.
- **Overtime** is the day's HRMS overtime (hours past the shift, every hour on a holiday or week off), put on the place with the most hours that day.
- **Access.** The route needs Office Staff Read (403 `PERMISSION_DENIED`) and HRMS Attendance Read (403 `HRMS_ATTENDANCE_READ_REQUIRED`); the page asks for the second before showing the tab's data.

No amounts are returned: no wages, rates or pay.

### 4. The cards

For the picked month:

- **Labours and Office Staff:** Days worked (a Half Day counts as half, with the full and half days under it), Hours worked (with the average a day worked), Overtime, Absent and leave, and the Projects worked at ("Places worked at" when an HRMS office branch is among them).
- **Site Engineers:** Days worked (days with a Check In), Hours worked and Projects worked at. The Check-In log has no absences, half days or overtime, so those are left out rather than shown as zeros.
- **Vendors:** Days supplied, Head-days, Most heads in a day, Overtime hours and Projects supplied.

All time: the first and last day worked (supplied, for a Vendor), days worked, hours (head-days for a Vendor) and the number of Projects.

### 5. Who sees what

- The tab follows the page: `masters.labours` Read for Labours and Site Engineers, `masters.vendors` for Vendors, `organization.team_members` for Office Staff. Office Staff attendance also needs HRMS Attendance Read (`hrms.attendance`); without it the tab says so.
- As in the Activity feed (CM-0038), a Project the viewer may not open is left out: its hours are not on the calendar or in the cards, and a day worked only there shows as not worked. The Owner sees every Project.
- A Site Engineer's days come from the Check-In log, so they need Attendance Read on the Project as well (CM-0044 §4).
- Office Staff days are not filtered by Project: HRMS Attendance Read already shows the whole Company's register (the monthly summary), so the tab shows the member's every entry, a Project site's included.

### 6. The API

`GET …/{id}/attendance?to=YYYY-MM&months=6` on each person's route (`/api/construction/labour/labours`, `/api/construction/masters/site-engineers`, `/api/construction/labour/vendors`, and the Office Staff route). `to` is the newest month (this month when left out) and `months` 1 to 12. Every route answers with the same model, `ConstructionPersonAttendanceResponseModel`: the months' days with their places, the person's first month, whether there are earlier months, and the all-time figures on the first page.

## Consequences

- The cards for a month are worked out in the browser from that month's days, so picking a month already loaded costs no request.
- All-time figures read every day of the person once, when the tab opens. A person has at most a few hundred days a year, so this is cheap; if it is not, it can become a stored summary later without changing the model.
- Vendor and Site Engineer days have no absences, so their cards leave those out rather than show zeros that would read as perfect attendance.
