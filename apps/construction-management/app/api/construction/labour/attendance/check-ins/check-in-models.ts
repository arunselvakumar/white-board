import { z } from "zod";

/** A Project's Check-In: people, entries and the log (ADR CM-0043). */
export const CHECK_INS_PATH = "/api/construction/labour/attendance/check-ins";

const KINDS = ["labour", "vendor", "site_engineer"] as const;
const ACTIONS = ["check_in", "check_out"] as const;
const STATUSES = [
  "present",
  "half_day",
  "absent",
  "on_leave",
  "holiday",
] as const;

const kind = z.enum(KINDS);
const action = z.enum(ACTIONS);
const instant = z.iso.datetime();
const ref = z.object({ id: z.string(), name: z.string() });

/**
 * A photo as base64 (no `data:` prefix). 1 MB of image is about 1.4 million
 * characters; the server checks the decoded bytes.
 */
const PHOTO_BASE64_MAX = 1_400_000;

// Requests

export const ListConstructionLabourCheckInPeopleRequestModel = z.object({
  projectId: z.uuid(),
});

export const GetConstructionLabourCheckInPersonRequestModel = z.object({
  projectId: z.uuid(),
  kind,
  personId: z.uuid(),
});

export const ListConstructionLabourCheckInEntriesRequestModel = z
  .object({
    projectId: z.uuid(),
    /** The attendance day, `YYYY-MM-DD`; today when left out. */
    date: z.iso.date().optional(),
    kind: kind.optional(),
    /** Part of the person's name. */
    q: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const RecordConstructionLabourCheckInRequestModel = z.object({
  projectId: z.uuid(),
  kind,
  /** A Labour, a Vendor or a Site Engineer, by `kind`. */
  personId: z.uuid(),
  action,
  /** The frame taken on submitting: a JPEG, PNG or WebP of at most 1 MB, base64. */
  photo: z.string().min(1).max(PHOTO_BASE64_MAX),
  /** The device's location, when the browser gave one. */
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      /** Metres. */
      accuracyMetres: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type RecordConstructionLabourCheckInRequestModel = z.infer<
  typeof RecordConstructionLabourCheckInRequestModel
>;

export const ConstructionLabourCheckInParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionLabourCheckInPersonPhotoParamsModel = z.object({
  kind,
  personId: z.uuid(),
});

export const VoidConstructionLabourCheckInRequestModel = z.object({
  /** Why the entry is wrong; 1 to 200 characters. */
  reason: z.string().min(1).max(200),
});

export type VoidConstructionLabourCheckInRequestModel = z.infer<
  typeof VoidConstructionLabourCheckInRequestModel
>;

// Responses

export const ConstructionLabourCheckInPersonResponseModel = z.object({
  kind,
  id: z.uuid(),
  name: z.string(),
  /** The Labour Category, "Site Engineer" or "Vendor"; null for a Labour with no category. */
  role: z.string().nullable(),
  /** The Labour Id or the Site Engineer's employee code. */
  code: z.string().nullable(),
  /** E.164. */
  phone: z.string().nullable(),
  /** The Labour's or Vendor's record has a photo (`…/people/{kind}/{id}/photo`). */
  hasPhoto: z.boolean(),
  state: z.object({
    /** `in` while their last entry is a Check In less than 16 hours old. */
    status: z.enum(["in", "out", "none"]),
    /** When they checked in (`in`) or out (`out`). */
    since: instant.nullable(),
  }),
  /** Live entries on today's attendance day. */
  entriesToday: z.int().nonnegative(),
});

export type ConstructionLabourCheckInPersonResponseModel = z.infer<
  typeof ConstructionLabourCheckInPersonResponseModel
>;

/** What the screens need around any read: the clock and what the viewer may do. */
const context = {
  /** The server's clock, so a wrong device clock does not mislead. */
  now: instant,
  /** The Company's IANA time zone. */
  timeZone: z.string(),
  /** Today in that zone, `YYYY-MM-DD`. */
  today: z.iso.date(),
  /** The Project's Site fence, when it has one. */
  siteFence: z.object({ name: z.string() }).nullable(),
  /** Attendance Create on the Project. */
  canCheckIn: z.boolean(),
  /** Attendance Delete on the Project. */
  canVoid: z.boolean(),
};

export const ListConstructionLabourCheckInPeopleResponseModel = z.object({
  ...context,
  siteEngineers: z.array(ConstructionLabourCheckInPersonResponseModel),
  labours: z.array(ConstructionLabourCheckInPersonResponseModel),
  vendors: z.array(ConstructionLabourCheckInPersonResponseModel),
});

export type ListConstructionLabourCheckInPeopleResponseModel = z.infer<
  typeof ListConstructionLabourCheckInPeopleResponseModel
>;

export const ConstructionLabourCheckInEntryResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  kind,
  personId: z.uuid(),
  personName: z.string(),
  role: z.string().nullable(),
  action,
  /** The server's clock when the entry arrived. */
  at: instant,
  /** The attendance day it belongs to, `YYYY-MM-DD`. */
  date: z.iso.date(),
  /** False once the photo was removed (90 days). `…/{id}/photo` serves it. */
  hasPhoto: z.boolean(),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      accuracyMetres: z.number().nullable(),
    })
    .nullable(),
  /** Against the Project's Site fence; null without a location or a fence. */
  fence: z.enum(["inside", "outside"]).nullable(),
  /** Set with `fence`; 0 inside. */
  metresOutside: z.int().nonnegative().nullable(),
  /** The member who held the device. */
  recordedBy: ref,
  voided: z.object({ at: instant, by: ref, reason: z.string() }).nullable(),
});

export type ConstructionLabourCheckInEntryResponseModel = z.infer<
  typeof ConstructionLabourCheckInEntryResponseModel
>;

export const GetConstructionLabourCheckInPersonResponseModel = z.object({
  ...context,
  person: ConstructionLabourCheckInPersonResponseModel,
  /** Their entries of today's attendance day, and any open one, oldest first. */
  entries: z.array(ConstructionLabourCheckInEntryResponseModel),
});

export type GetConstructionLabourCheckInPersonResponseModel = z.infer<
  typeof GetConstructionLabourCheckInPersonResponseModel
>;

export const ListConstructionLabourCheckInEntriesResponseModel = z.object({
  ...context,
  /** The attendance day listed. */
  date: z.iso.date(),
  /** Newest first. */
  items: z.array(ConstructionLabourCheckInEntryResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
});

export type ListConstructionLabourCheckInEntriesResponseModel = z.infer<
  typeof ListConstructionLabourCheckInEntriesResponseModel
>;

/** What an entry (or a void) did to a Labour's attendance day. */
export const ConstructionLabourCheckInDayResponseModel = z.object({
  /**
   * `created`: marked Present; `updated`: its times were worked out again;
   * `cleared`: the day was removed with its last entry; `kept`: left as
   * the sheet has it (see `note`).
   */
  effect: z.enum(["created", "updated", "cleared", "kept"]),
  /** Null after `cleared`, or when there is no day. */
  status: z.enum(STATUSES).nullable(),
  /** `HH:MM`, Company time. */
  checkIn: z.string().nullable(),
  checkOut: z.string().nullable(),
  breakMinutes: z.int().nullable(),
  /** A line for the operator when the day was kept as it was. */
  note: z.string().nullable(),
});

export type ConstructionLabourCheckInDayResponseModel = z.infer<
  typeof ConstructionLabourCheckInDayResponseModel
>;

export const RecordConstructionLabourCheckInResponseModel = z.object({
  entry: ConstructionLabourCheckInEntryResponseModel,
  /** The same action was recorded moments ago: this is that entry, nothing was written. */
  repeated: z.boolean(),
  person: ConstructionLabourCheckInPersonResponseModel,
  /** Null for a Vendor or a Site Engineer: their entries are a log only. */
  day: ConstructionLabourCheckInDayResponseModel.nullable(),
});

export type RecordConstructionLabourCheckInResponseModel = z.infer<
  typeof RecordConstructionLabourCheckInResponseModel
>;

export const VoidConstructionLabourCheckInResponseModel = z.object({
  entry: ConstructionLabourCheckInEntryResponseModel,
  person: ConstructionLabourCheckInPersonResponseModel,
  day: ConstructionLabourCheckInDayResponseModel.nullable(),
});

export type VoidConstructionLabourCheckInResponseModel = z.infer<
  typeof VoidConstructionLabourCheckInResponseModel
>;
