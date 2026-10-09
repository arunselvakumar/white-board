# CM-0011 — Check-in, check-out and working hours on labour attendance

- Status: accepted
- Date: 2026-10-09
- Tickets: CM-220
- Relates to: [CM-0004](CM-0004-ledger-first-balances.md) (overtime posts to the ledger), CM-210 / CM-211 (labour attendance)

Labour attendance records one status per Labour per day (Present, Half Day, Absent, Leave, Holiday). Overtime is typed in by hand as hours at a rate. Owners asked to record when each Labour checked in and out on a Project, and to give each Labour a standard working day (8 hours by default). Time worked beyond that day should count as overtime.

## Decision

The owner settled these choices on 2026-10-09.

**Working hours belong to the Labour.** `labours.working_hours_per_day` is a decimal of hours, more than 0 and at most 24, with two places, and defaults to 8. It sits on Add / Edit Labour next to the overtime wage and appears in the Excel import and export. A watchman on 12 hours and a mason on 8 can differ. Each attendance day snapshots it in `labour_attendance.working_hours`, the same way the wage is snapshotted. A later change never reprices a past day, but re-marking a day takes the current value, just as it takes the current wage.

**Check-in and check-out are optional and only apply to Present and Half Day.** They are clock times `HH:MM` in the Company's time zone (`check_in`, `check_out`). A check-out needs a check-in. A check-in alone is allowed, so a supervisor can mark arrivals in the morning and add check-outs in the evening. If the check-out is at or before the check-in, it falls on the next day (a night shift); the two times can't be equal. "Mark all present", copying yesterday and days without times work as before. Absent, Leave and Holiday can't have times (`TIMES_NEED_PRESENT`).

**A break is taken off, 1 hour by default.** `break_minutes` is whole minutes from 0 to 720, set whenever there is a check-in and 60 unless changed on the day. It must be shorter than the time between check-in and check-out (`BREAK_TOO_LONG`). So 09:00–18:00 with the default break is 8 hours worked, which is no overtime for an 8-hour Labour.

**Overtime from the times is filled in automatically and stays editable.**

- Worked = check-out − check-in − break.
- Extra = worked − the day's working hours, in hundredths of an hour, rounded half up.

Extra hours become an overtime line marked `from_times`. Its category defaults to the Labour's category and its rate to the Labour's overtime wage, and both can be changed. The server works out the hours of a `from_times` line (`priceDay`), so the hours stored always match the times. A client sends `{ fromTimes: true }` and any hours it sends are ignored. The line drops out while there is no check-out or no extra time. If the supervisor edits the hours, the screen turns it into an ordinary manual line that no longer follows the times. Manual lines can sit beside it, the 24-hour daily cap still applies, and a day has at most one `from_times` line.

**Short days change nothing.** Pay still follows the status (Present = full day, Half Day = half). Times never change the status or reduce pay. The worked hours are shown so the supervisor can choose Half Day. A Half Day uses the full working hours as its overtime threshold, so overtime only starts after a full day's work.

## Consequences

- Migration `construction_labour_attendance_times` adds the columns with defaults (8 hours, no times, `from_times = false`), so existing days and amounts are unchanged. Check constraints repeat the domain rules: time format, check-out needs check-in, times only on Present / Half Day, break 0–720 set exactly when there is a check-in, and working hours more than 0 and at most 24.
- The marking sheet adds In, Out and Break to each row, and the selection bar adds "Set times" for several Labours at once. "Copy yesterday" also copies the times.
- The day's read model adds `checkIn`, `checkOut`, `breakMinutes`, `workingHours` and `workedHours`. The Recorded list and the All Labour Attendance report (day by day) show In, Out and Worked hours. The month grid and muster roll already show overtime hours and are unchanged.
- Times are typed by the supervisor. There is no biometric or geo check-in, and a time is not checked against the clock (a check-in later today is allowed). That stays out of scope until the mobile app.
- Vendor attendance stays as headcount per shift. It names no individuals, so it has nowhere to record their times.

## Considered options

- **One Company-wide working day in Settings.** It is simpler, but it can't hold different hours for a watchman and a mason. Rejected.
- **Overtime always equal to the times and locked.** This rules out a site's usual practice of rounding overtime or granting less. Rejected in favour of a filled-in line that the supervisor can edit.
- **No break.** 09:00–18:00 would then give an hour of overtime every day. Rejected.
- **Times required on Present.** That would slow bulk marking and break "Mark all present". Rejected.
- **Rounding overtime to 15 or 30 minutes.** Not asked for. Hours are exact to 0.01 hours, and the supervisor can edit the line.
