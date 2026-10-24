# CM-0028 — Settings is its own main-menu item, with Advanced Settings below the Company profile

- Status: accepted
- Date: 2026-10-24
- Relates to: CM-115 (Company profile), `modules/12-settings-configuration.md` (Sequence IDs, Back-dated Entry, billing addresses, GRN fields), Company ownership and Backup & export

The Company profile and the Company's settings both sat under Masters → Company, as two separate items: **Company profile** and **Settings**. The Settings page only listed six more pages. The owner wanted Settings to be its own item in the main menu, not a Master: Masters are the Company's lists, and settings are not a list.

## Decision

- **Settings is a main-menu item**, after Masters, at `/app/settings`, with a gear icon. It is shown to everyone, like Masters. What each person may change is still decided by each screen's own permission check.
- **The Settings page is the old Company profile page, titled "Settings".** It has no back link, because it is a top-level page now. Below the profile form comes a divider and an **Advanced Settings** section: one card each for Sequence IDs, Back-dated Entry, Billing addresses, GRN fields, Company (ownership transfer and delete) and Backup & export.
- **Two kinds of Save changes.** The profile form's **Save changes** saves only the Company details (name, mobile, email, GSTIN, PAN, address, currency, time zone). Each Advanced Settings page keeps its own Save changes. Sequence IDs and Billing addresses are lists edited in dialogs, and Company and Backup & export are actions, so one shared save button could not cover them.
- **The Advanced Settings pages move to `/app/settings/…`**, and their "Back to Settings" links go to `/app/settings`. Masters → Company keeps only Team Members and Designations. The old Masters → Settings page is deleted.
- **Old URLs redirect permanently.** `/app/masters/company` goes to `/app/settings`, and `/app/masters/settings/…` to `/app/settings/…`. Bookmarks and old links keep working.
- **No API or permission change.** The pages and their APIs are the same. Only where they sit in the menu has changed.

## Consequences

- When the profile is hidden (no Settings permission), the page shows the existing "You cannot see the Company profile" notice, and Advanced Settings is still shown below it. Each of those pages checks permissions itself, as it did under Masters.
- New Company-wide settings go into `lib/settings-nav.ts` and appear under Advanced Settings, not in `lib/masters-nav.ts`.

## Considered options

- **Put the Back-dated Entry and GRN fields forms inline under Advanced Settings, with one shared save.** This would make a long page, and it would still leave four cards: Sequence IDs and Billing addresses are lists, and Company and Backup & export are actions. Cards keep the page short and keep one Save changes per form.
- **Keep Settings under Masters and only rename it.** That would not answer the owner's request for a top-level menu item.
