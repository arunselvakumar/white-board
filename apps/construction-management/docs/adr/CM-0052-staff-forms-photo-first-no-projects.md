# CM-0052 — Staff forms: the photo first, taken with the camera, and no Projects field

- Status: accepted (2026-11-26, the owner's request)
- Date: 2026-11-26
- Relates to: [CM-0033](CM-0033-one-page-staff-no-designations-labours-on-many-projects.md) (a Labour's Projects on the Labour form), [CM-0037](CM-0037-site-engineer-page-sign-in-and-default-roles.md) (Site Engineer Projects), [CM-0038](CM-0038-project-staffing-and-activity-feeds.md) (a Project's Resources), [CM-0041](CM-0041-labour-site-engineers-come-from-the-project.md) (who a Labour answers to), [CM-0043](CM-0043-site-check-in.md) (§6: the check-in camera)

The owner asked (2026-11-26) for two changes to the forms of every kind of staff (Labour, Site Engineer, Vendor, Office Staff):

1. **No Projects field.** A Project's Resources already puts Site Engineers, Labours, Team Members and Vendors on it, so choosing Projects on the person's own form is a second way to do the same thing.
2. **The photo first, and taken with the camera.** Photo & documents was the last card on Edit Labour; it should be the first. Uploading a file was the only way to set a photo; a phone's camera or a laptop's webcam should work too.

## Decision

### 1. Projects are set from the Project

- The Projects field leaves Add and Edit Labour, Add and Edit Site Engineer, Add and Edit Vendor, and Add Staff. Edit Staff loses its Projects tab (an old `?tab=projects` link opens Details).
- People are put on a Project from its **Resources** (CM-0038): Site Engineers, Add Labours, Team Members and Vendors. A Labour still moves between Projects on a date with **Transfer**.
- The forms no longer send `projectIds`. The edit routes treat a missing `projectIds` as **keep the current Projects**: Labours already did; Vendors (`POST /vendors/{id}/update`) and Site Engineers (`POST /site-engineers/{id}/update`) now do too, instead of removing every Project. Sent, it still replaces them, so other callers keep working. Add without `projectIds` adds the person to no Project, as before.
- The Labour form's "They answer to the Site Engineers on their Projects" line went with the Projects card; CM-0041 is unchanged.

### 2. Photo & documents first, with Take photo

- **Edit Labour and Edit Vendor** open with the Photo & documents card: the photo, then Other documents. Each change saves at once, as before. Vendors already had photo and document routes; this is their first screen.
- **Add Labour and Add Vendor** open with the photo too. It is taken or chosen before Save, kept in the browser, and uploaded once the record is saved. If that upload fails, the record is saved anyway and their page opens, with no photo, to try again. Documents need the saved record, so they come after Save.
- **Take photo** sits beside Upload photo on staff photos and on My Profile (not on the Company logo or equipment photos). It opens a dialog with the device camera: the rear camera first on a phone, the webcam on a laptop, Switch camera when there is more than one. Take photo freezes the frame; Retake or Use photo. The photo is a JPEG of at most 1 MB, uploaded like a chosen file. The camera is on only while the dialog is open.
- The camera is the check-in camera (CM-0043 §6), moved to `app/app/_components/camera` so both screens share it.

## Not done

- Site Engineers and Office Staff have no staff-side photo: their photo is the one they set in My Profile (which now has Take photo). Letting the Owner set it from their page needs a new route and a rule on who may change someone else's profile photo.
