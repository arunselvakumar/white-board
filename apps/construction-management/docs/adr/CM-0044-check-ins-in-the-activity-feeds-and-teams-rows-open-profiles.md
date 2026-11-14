# CM-0044 — Check-in entries in the Labour and Project Activity feeds, and Teams rows that open the person's page

- Status: accepted (2026-11-14, the owner's request)
- Date: 2026-11-14
- Amends: [CM-0038](CM-0038-project-staffing-and-activity-feeds.md) question 2 ("Is attendance in the Project feed? No"), question 4 ("Does the Site Engineer page get an Activity tab too? Not in this round") and §1 (the feeds' sources), [CM-0043](CM-0043-site-check-in.md) ("A Check-In section on the Project Dashboard or the Activity feeds" was not in that round)
- Relates to: [CM-0042](CM-0042-project-resources-become-teams.md) (the Teams page), [CM-0036](CM-0036-one-staff-group-and-site-engineers.md) (where each person's page is), [CM-0011](CM-0011-attendance-check-in-out-and-working-hours.md) (a day's In and Out)

After using Check-In (CM-0043), the owner asked for three things (2026-11-14):

1. On a Project's **Teams**, a Labour or a Vendor "is not clickable". Clicking one should open their profile.
2. A Labour's **Activity** shows only the day's attendance. Each Check In and each Check Out should be an entry of its own, with the photo taken as a small preview that opens.
3. The **Project's Activity** should show them too: "Labour 1 checked in at 10:02 am", with the photo, the location and a link to open it in Google Maps. The same on the Labour's Activity.

## What was there

- Teams already linked a Labour's and a Site Engineer's name to their page, but the name looked like plain text and only underlined under a mouse. On a phone nothing said it could be tapped. Vendors, Team Members, Contractors and Suppliers were not linked at all.
- The Labour feed has one **attendance** entry per marked day ("Present at Sky Towers", with In – Out), plus changed and cleared entries. It reads `labour_attendance`, which holds one In and one Out.
- The Project feed shows Labours and Site Engineers being added and removed. CM-0038 left attendance out of it: hundreds of rows a day would bury those.

## Decision

### 1. On Teams, every row opens that person's or party's page

- The whole row is the link, not only the name: it has a hover and focus state and a chevron at its end, so it reads as something to open on a phone as well. A row's own controls (a Labour's Actions menu, a Site Engineer's Remove) stay separate targets on top of it.
- Where each goes: a Labour to `/app/staff/labours/<id>`, a Site Engineer to `/app/staff/site-engineers/<id>`, a Vendor to `/app/staff/vendors/<id>`, a Team Member to `/app/staff/office-staff/<id>`, a Contractor and a Supplier to their Masters page.
- A row is a link only when the viewer may read the menu its page belongs to (`masters.labours`, `masters.vendors`, `organization.team_members`, `masters.contractors`, `masters.suppliers`). Otherwise it stays plain text, as now. The Owner's row among Team Members is not a link: the Owner has no Office Staff page.

### 2. A check-in entry is an Activity entry of its own

Both feeds gain one entry per check-in entry (`construction_labour.check_in_events`, CM-0043):

| Feed    | Sentence                                                                        | Whose entries                                                  |
| ------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Labour  | "**Checked in** at **Sky Towers** · 10:02 am" (or "Checked out")                | That Labour's                                                  |
| Project | "**Murugan Ganesan** checked in · 10:02 am" (or "checked out"), with their role | Everyone's on the Project: Labours, Site Engineers and Vendors |

Each shows:

- **The photo** as a small preview; clicking it opens it large, as in the Check-In log. "Photo removed" once it is older than 90 days.
- **The location**: "Inside the site fence", "240 m outside the site fence", "Location saved" when the Project has no Site fence, or "No location"; and **Open in Maps** (Google Maps, a new tab) when there is one.
- "by _name_ · _when recorded_", like every other entry: the member who held the device.
- **A voided entry stays**, struck through, with "Voided: _reason_". The feed says what happened, and a void happened.

A Labour's **attendance** entry for the day stays as it is ("Present at Sky Towers", In – Out, overtime). The check-in entries sit beside it on the same day: the day is what they add up to.

### 3. Where an entry sits in the feed

- Its day is its **attendance day** (CM-0043 §1), so a night shift's Check Out sits on the day the shift began, with the day's attendance entry.
- Within the day it is ordered by the time it was recorded, which for a check-in entry is the time it happened.
- In the Project feed each check-in entry is its own row. They are not grouped the way "12 Labours added" is: each has its own photo and place.

### 4. Who sees them

A check-in entry, with its photo and location, shows to a viewer who has **Attendance Read** (`labour.attendance`) on the entry's Project. That is the permission of the Check-In log itself, so the feeds show nobody more than the log would. A viewer without it sees the feeds as before.

This is one rule for both feeds. In the Labour feed it sits on top of the existing rule that entries of a Project the viewer may not open are left out.

### 5. Filters

- **Labour feed.** Type gains **Check-In** (All, Projects, Attendance, Check-In, Profile). Attendance keeps meaning the day's status.
- **Project feed.** A new **Type** filter: **All**, **Team changes** (added, removed, transferred) and **Check-In**. The **Who** filter gains **Vendors** beside Site Engineers and Labours, and applies to check-in entries too. Both are in the address. A busy Project has hundreds of check-in entries a day; Team changes brings back the short list CM-0038 protected.

### 6. Still read at read time

Both feeds stay read models assembled when they are read (CM-0038 §1). The check-in entries are one more source in the labour context, read with the same keyset as the others (day, recorded time, kind rank, row id) and merged in `src/composition`. No activity table, no migration, no back-fill: entries recorded before this release show the same as those after it.

### 7. A Site Engineer's and a Vendor's page get an Activity tab (the owner, 2026-11-14)

The owner asked for it the same day, answering CM-0038's question 4.

- `/app/staff/site-engineers/<id>` and `/app/staff/vendors/<id>` get **Details** (the form, unchanged) and **Activity** tabs, the tab in the address (`?tab=activity`), as on a Labour's page. Add Site Engineer and Add Vendor have no tabs. Typed changes on Details survive a switch to Activity and back.
- **What the feed shows**, newest first, by day, 30 at a time:
  - their **check-in entries**, exactly as in the Labour feed ("**Checked in** at **Sky Towers** · 10:02 am", the photo, the place, Open in Maps, a void);
  - **Added to** and **Removed from** a Project. For a Site Engineer these come from their sign-in's Project history, the source the Project feed already reads (CM-0038 §1). For a Vendor they come from the `vendor.projects_changed` audit events, by comparing each event's set of Projects with the one before.
- A Vendor's **attendance** (the headcount per shift and Labour Category) is not in the feed in this round: it is a day's count for the gang, not something that happened to the Vendor, and the Vendor attendance screen already lists it.
- **Filters**, in the address: **Type** (All, Projects, Check-In), **Project** and a date range.
- **Who sees it.** The tab needs Read on the page's own menu (`masters.labours` for a Site Engineer, `masters.vendors` for a Vendor). Entries of a Project the viewer may not open are left out, and check-in entries need Attendance Read on their Project (§4), as in the Labour feed. No amounts are shown.
- Both are read models assembled at read time (§6), each behind its own route: `GET /api/construction/masters/site-engineers/{id}/activity` and `GET /api/construction/labour/vendors/{id}/activity`.

## Consequences

- CM-0038's answer to question 2 changes for check-in entries only. The day's attendance status is still not in the Project feed.
- The Project feed's default view is much longer on a Project that uses Check-In. The Type filter is the answer, and its choice is kept in the address so a bookmark opens on Team changes.
- A feed page costs one more indexed read. `check_in_events` already has an index by Project and day and one by person and time.
- The photo is served by the Check-In log's route, with its permission and its private caching. The feeds add no second way to a photo.
- A Site Engineer who has no sign-in has no Project history; their feed has check-in entries only once they are on a Project.

## Considered options

- **Only the name as the link, styled as one.** Less change, but a small target on a phone, and the owner's words were "clicks on it" about the row. Not chosen.
- **Fold the times into the attendance entry** ("Present · in 10:02, out 1:05, in 1:45, out 5:00"). No new entries, but it has nowhere for a photo or a place per entry, which is what was asked for. Not chosen.
- **Check-in entries visible to anyone who sees the feed, the photo only with Attendance Read.** Two rules to explain, and it shows who was at the site, and when, to people the log would not. Not chosen.
- **Group a day's check-ins in the Project feed** ("31 people checked in"). Short, but it hides the photo and the place, which are the point. The Type filter keeps the list short instead. Not chosen.
- **An activity table written with each entry.** Rejected in CM-0038 for the same reasons that hold here: a second write in every command, and a missed one is a silent gap.
