import type {
  CheckInEntry,
  CheckInPeople,
  CheckInPerson,
  CheckInPersonView,
} from "@/src/queries/check-ins";

/*
 * Kumari Heights at 2:00 pm on 14 Nov 2026 (Company time Asia/Kolkata):
 * a Site Engineer in since 9:15 am, Labours in, out and not yet in, and two
 * Vendors.
 */

export const PROJECT_ID = "0199c4a0-0000-7000-8000-000000000001";
export const TIME_ZONE = "Asia/Kolkata";
export const TODAY = "2026-11-14";
/** 2:00 pm in Asia/Kolkata. */
export const NOW = "2026-11-14T08:30:00.000Z";

const MEMBER = { id: "member-anugraha", name: "Anugraha Selvan" };

function person(
  overrides: Partial<CheckInPerson> & Pick<CheckInPerson, "id" | "name">,
): CheckInPerson {
  return {
    kind: "labour",
    role: null,
    code: null,
    phone: null,
    hasPhoto: false,
    state: { status: "none", since: null },
    entriesToday: 0,
    ...overrides,
  };
}

export const RAVI = person({
  kind: "site_engineer",
  id: "0199c4a0-0000-7000-8000-0000000000e1",
  name: "Ravi Shankar",
  role: "Site Engineer",
  code: "EMP-014",
  phone: "+919443012345",
  state: { status: "in", since: "2026-11-14T03:45:00.000Z" },
  entriesToday: 1,
});

export const PRIYA = person({
  kind: "site_engineer",
  id: "0199c4a0-0000-7000-8000-0000000000e2",
  name: "Priya Dharshini",
  role: "Site Engineer",
  code: "EMP-021",
  phone: "+918056123456",
});

/** In since 10:02 am. */
export const MURUGAN = person({
  id: "0199c4a0-0000-7000-8000-0000000000a1",
  name: "Murugan Ganesan",
  role: "Mason",
  code: "L-0042",
  phone: "+919876543210",
  hasPhoto: true,
  state: { status: "in", since: "2026-11-14T04:32:00.000Z" },
  entriesToday: 1,
});

/** Out since 1:05 pm, after a morning in. */
export const KAVITHA = person({
  id: "0199c4a0-0000-7000-8000-0000000000a2",
  name: "Kavitha Murugan",
  role: "Helper",
  code: "L-0043",
  phone: "+919500011122",
  state: { status: "out", since: "2026-11-14T07:35:00.000Z" },
  entriesToday: 2,
});

/** Not in yet today. */
export const DHURESH = person({
  id: "0199c4a0-0000-7000-8000-0000000000a3",
  name: "Dhuresh Nawin",
  role: "Carpenter",
  code: "L-0051",
  phone: "+917708899001",
});

export const ANBU = person({
  id: "0199c4a0-0000-7000-8000-0000000000a4",
  name: "Anbu Selvan",
  role: null,
  code: "L-0060",
  phone: null,
});

export const RAJA = person({
  kind: "vendor",
  id: "0199c4a0-0000-7000-8000-0000000000f1",
  name: "Raja Fabricators",
  role: "Vendor",
  phone: "+919840055566",
  hasPhoto: true,
  state: { status: "in", since: "2026-11-14T03:30:00.000Z" },
  entriesToday: 1,
});

export const SELVAM = person({
  kind: "vendor",
  id: "0199c4a0-0000-7000-8000-0000000000f2",
  name: "Selvam Shuttering Works",
  role: "Vendor",
  phone: "+919003344556",
});

/** What every read carries: the clock and what the viewer may do. */
export const CONTEXT = {
  now: NOW,
  timeZone: TIME_ZONE,
  today: TODAY,
  siteFence: { name: "Kumari Heights site" },
  canCheckIn: true,
  canVoid: true,
} satisfies Omit<CheckInPeople, "siteEngineers" | "labours" | "vendors">;

export function peopleResponse(
  overrides: Partial<CheckInPeople> = {},
): CheckInPeople {
  return {
    ...CONTEXT,
    siteEngineers: [RAVI, PRIYA],
    labours: [MURUGAN, KAVITHA, DHURESH, ANBU],
    vendors: [RAJA, SELVAM],
    ...overrides,
  };
}

let next = 0;

/** A check-in entry of `who`, at `at`. */
export function entry(
  who: CheckInPerson,
  overrides: Partial<CheckInEntry> & Pick<CheckInEntry, "action" | "at">,
): CheckInEntry {
  next += 1;
  return {
    id: `0199c4a0-0000-7000-8000-${String(next).padStart(12, "0")}`,
    projectId: PROJECT_ID,
    kind: who.kind,
    personId: who.id,
    personName: who.name,
    role: who.role,
    date: TODAY,
    hasPhoto: true,
    location: { latitude: 8.1833, longitude: 77.4119, accuracyMetres: 12 },
    fence: "inside",
    metresOutside: 0,
    recordedBy: MEMBER,
    voided: null,
    ...overrides,
  };
}

/** Murugan's Check In at 10:02 am. */
export const MURUGAN_IN = entry(MURUGAN, {
  action: "check_in",
  at: "2026-11-14T04:32:00.000Z",
});

/** Kavitha's morning: in at 9:00 am outside the fence, out at 1:05 pm. */
export const KAVITHA_ENTRIES = [
  entry(KAVITHA, {
    action: "check_in",
    at: "2026-11-14T03:30:00.000Z",
    fence: "outside",
    metresOutside: 240,
  }),
  entry(KAVITHA, {
    action: "check_out",
    at: "2026-11-14T07:35:00.000Z",
  }),
];

export function personView(
  who: CheckInPerson,
  entries: CheckInEntry[] = [],
  overrides: Partial<CheckInPersonView> = {},
): CheckInPersonView {
  return { ...CONTEXT, person: who, entries, ...overrides };
}

/**
 * A small JPEG (an 8 × 6 grey frame), base64 without the `data:` prefix:
 * the photo a fake camera takes.
 */
export const STILL_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAACKADAAQAAAABAAAABgAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgABgAIAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMABAQEBAQEBgQEBgkGBgYJDAkJCQkMDwwMDAwMDxIPDw8PDw8SEhISEhISEhUVFRUVFRkZGRkZHBwcHBwcHBwcHP/bAEMBBAUFBwcHDAcHDB0UEBQdHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHf/dAAQAAf/aAAwDAQACEQMRAD8A4WiiivYOE//Z";
