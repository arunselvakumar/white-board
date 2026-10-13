# Reports product decisions

[Issue #71](https://github.com/arunselvakumar/white-board/issues/71) adds a **Reports** area for Training Institutes: nineteen reports (R1–R19) over attendance, teaching, Batches, fees, Enquiries and demos, Online Classes, Tests, Homework, and two monthly summaries. Arun decided on 6, 8 and 13 Oct 2026 that every report is built together, that Not marked Classes are left out of attendance %, and that email is in scope while WhatsApp and SMS are not. The PRD lists ten defaults to follow unless Arun changes them; this record keeps them and the choices made while building.

## 1. One report shape for every output

**Decision:** Every report is built on the server into one **report document**: a header (institute name, report name, period, filters, generated time) and sections that are tables, figures, or lines of text, with every value already written out (₹1,25,000, 12 Oct 2026, 83% (15 of 18)). The screen, print, Excel, PDF and email all render that one document.

The PRD's strictest rule is that downloads, prints and emails hold exactly what that person can see on screen. With one document, the role checks run once, before anything is rendered, so no output can hold more than the screen.

**Considered options:** one document rendered everywhere (chosen); a screen-specific response plus separate export code per report.

## 2. How attendance is counted

**Decision:** One set of rules in `attendance-count.ts` and `report-schedule.ts`, used by every report:

- Attended = Present + Late. Absent = Informed absent + Uninformed absent, always labelled apart.
- Excused and Not marked are left out of the % entirely (PRD default 1, and Arun's 13 Oct decision). With nothing counted the % is "–", never 0%.
- A Class held is a scheduled Class whose start time has passed, after Class Changes and Holidays are applied the way the Calendar applies them (ADR-0028). A Moved Class counts once, on its new date; its original slot, Cancelled Classes and Holidays are listed but never counted.
- Attendance is kept per Batch and date (one Register per day, `attendance_registers`), so a Student's day with Classes held counts once.
- Classes before an Enrollment began or after it ended (or the Student dropped) aren't counted. Student-specific Timings count only the Student's own Classes.
- A date the Student was marked on counts even when today's Timings no longer produce a Class there: Batch Timings can change and their history isn't kept, but a saved mark proves the Class was held.

## 3. Teacher scope and credit

**Decision:** A Teacher sees a Batch's data only for the dates of their assignments, from the assignment's local date to the day it ended; past assignments still count for those dates. A deactivated Teacher opens no report at all. In a Batch with several Teachers, a Class is credited to whoever first saved its attendance or started its hosted Class (PRD default 2). When only the Owner recorded it and the Batch has one Teacher that day, it is credited to that Teacher; with several, it counts once in the Owner's total but for no Teacher. A Class with no record shows "No record" for every assigned Teacher, never "Missed". "Scheduled" counts Cancelled and Holiday Classes too (Meena's example: Scheduled 4, Cancelled 1, Conducted 3); a Moved Class's original slot isn't scheduled, its new slot is. No pay appears anywhere (default 3).

## 4. Online join records

**Decision:** Whiteboard did not record who joined a hosted Class. A **Class join** is now noted when a Student, or a Parent for their child, joins a Class hosted in Whiteboard: one row per Class and Enrollment with the first and latest join time. Join records feed R1, R14 and R18 only; they never mark or pre-fill attendance (default 7). Classes on an external meeting link show "Join data not available", never 0%. Join rates before this release have no data.

## 5. Settings, remarks, email

- **Report settings** (Owner only): threshold 75%, absent in a row 3, minimum counted Classes 4, academic year from June (defaults 4 and 5). One row per Workspace; no row means the defaults. Changes apply to every report straight away, including past periods.
- **R18 remarks:** the Owner and each Teacher of one of the Student's Batches that month can keep one remark of up to 300 characters per Student and month (default 10). Saving blank removes it. Remarks are the only thing written from Reports.
- **Email:** the Owner can email R11 or R18, as a PDF, to the father, mother and Guardian email addresses on the Student, after confirming (default 9); each email holds one Student's report. Students with no parent email are listed as "not sent: no email". The Owner can also email any report to their own account email (PDF where the report has one, otherwise Excel). Nothing is sent automatically.
- **Formats:** Excel for every staff report and R1; PDF for R1, R11, R14 (family), R15, R17 (family), R18 and R19; Students and Parents download their own reports as PDF (default 8). Excel files are written without a library; PDFs embed Noto fonts, as Construction Management's do, so ₹ and names in Indian scripts print.

## Also decided while building

- **Dues match everywhere.** R9 uses the #36 rules (`assessFeeDues`, ADR-0039). The Owner Dashboard's outstanding dues now count ended Enrollments that still owe money too, so R9, the dues list's "All with a balance" and the Dashboard show one total (PRD §6.6). "Not yet due" and the overdue age groups come from the oldest unpaid due date; plans whose due dates don't add up are "Dates unclear" and sort by amount owed.
- **Enquiry funnel steps.** An Enquiry is "Followed up" once it has a follow-up, a demo, or an admission. "Demo booked" and "Demo attended" count a prospect once however many demos they had. Cancelled demos aren't booked. R12 is Owner only (default 6).
- **Receipt gaps.** Numbers missing between the lowest and highest Receipt in the register are flagged, including Fee Payments deleted as mistakes.
- **Institute time zone.** Reports read "today" and the generated time in the time zone most of the Workspace's Batches use (Asia/Kolkata by default); each Class still uses its own Batch's time zone.
- **Not built because the data isn't kept:** a payment reference or note (R10), Fee Plan change history (R11), and attendance for Classes whose Timings changed without a mark. The PRD rules out new data entry, so these show what Whiteboard has.
