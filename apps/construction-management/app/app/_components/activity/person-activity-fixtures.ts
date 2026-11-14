import type {
  PersonActivityEntry,
  PersonActivityPage,
} from "@/src/queries/activity";

/** What "Today" is in the stories: 11 Nov 2026, noon in India. */
export const PERSON_STORY_NOW = new Date("2026-11-11T06:30:00Z");

function at(date: string, time: string): string {
  // India is UTC+5:30.
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

const by = "Arun Selva Kumar";

type Project = { id: string; name: string };

/**
 * A Site Engineer's or a Vendor's feed, newest first: put on `second`
 * today; a night shift at `first` on 10 Nov 2026 (in inside the fence,
 * out at 6:05 am on the 11th outside it, a Check In voided by mistake);
 * taken off Old Mall, which the viewer may not open, on 9 Nov; put on
 * `first` on 1 Aug, with a Check In whose photo was removed and that had
 * no location.
 */
export function personActivityEntries(
  first: Project,
  second: Project,
): PersonActivityEntry[] {
  const one = { ...first, canOpen: true };
  const two = { ...second, canOpen: true };
  const checkIn = (
    id: number,
    fields: Partial<Extract<PersonActivityEntry, { kind: "check_in" }>> & {
      date: string;
      at: string;
    },
  ): PersonActivityEntry => {
    const entryId = `0199a1b2-0000-7000-8000-00000000d00${String(id)}`;
    return {
      id: `check_in:${entryId}`,
      kind: "check_in",
      recordedAt: fields.at,
      by: "Karthik Raja",
      project: one,
      action: "check_in",
      entryId,
      hasPhoto: true,
      location: { latitude: 13.0827, longitude: 80.2707, accuracyMetres: 8 },
      fence: "inside",
      metresOutside: 0,
      voided: null,
      ...fields,
    };
  };
  return [
    {
      id: "project_added:2",
      kind: "project_added",
      date: "2026-11-11",
      recordedAt: at("2026-11-11", "11:40"),
      by,
      project: two,
      remark: null,
    },
    checkIn(3, {
      date: "2026-11-10",
      at: at("2026-11-11", "06:05"),
      action: "check_out",
      location: { latitude: 13.0841, longitude: 80.2705, accuracyMetres: 12 },
      fence: "outside",
      metresOutside: 240,
    }),
    checkIn(2, {
      date: "2026-11-10",
      at: at("2026-11-10", "22:04"),
      fence: null,
      metresOutside: null,
      voided: { reason: "Checked in twice by mistake" },
    }),
    checkIn(1, { date: "2026-11-10", at: at("2026-11-10", "22:02") }),
    {
      id: "project_removed:1",
      kind: "project_removed",
      date: "2026-11-09",
      recordedAt: at("2026-11-09", "17:00"),
      by,
      project: {
        id: "0199a1b2-0000-7000-8000-00000000a009",
        name: "Old Mall",
        canOpen: false,
      },
      remark: null,
    },
    checkIn(0, {
      date: "2026-08-01",
      at: at("2026-08-01", "09:00"),
      hasPhoto: false,
      location: null,
      fence: null,
      metresOutside: null,
    }),
    {
      id: "project_added:1",
      kind: "project_added",
      date: "2026-08-01",
      recordedAt: at("2026-08-01", "08:30"),
      by,
      project: one,
      remark: null,
    },
  ];
}

export function personActivityPage(
  items: PersonActivityEntry[],
  nextCursor: string | null = null,
): PersonActivityPage {
  return { items, nextCursor, timeZone: "Asia/Kolkata" };
}
