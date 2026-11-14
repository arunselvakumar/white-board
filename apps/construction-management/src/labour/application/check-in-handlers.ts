import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  addDays,
  assertCalendarDate,
  daysBetween,
  todayIn,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import {
  checkImage,
  companyFileKey,
  sniffImageType,
  type NewStoredFile,
  type ObjectStorage,
  type StoredObject,
} from "@/src/shared-kernel/files";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import {
  compareWithFence,
  dayEffect,
  dayKeptNote,
  decideEntry,
  personState,
  readDeviceFix,
  timesFromEntries,
  voidReason,
  type CheckInAction,
  type CheckInPersonKind,
  type DayEffect,
  type DeviceFix,
  type EntryDecision,
  type LiveEntry,
  type SiteFence,
} from "../domain/check-in";
import { createdDayMark, timesDayMark } from "../domain/check-in-day";
import { priceDay, type PricedDay } from "../domain/labour-attendance";
import type { AttendanceStatus } from "../domain/wages";
import type { LabourCategoryDirectory, ProjectDirectory } from "./directories";
import type {
  AttendanceLabourer,
  LabourDayWrite,
  StoredLabourDay,
} from "./labour-attendance-handlers";

/** A person who can be checked in, as the screens show them. */
export type CheckInPersonRecord = {
  kind: CheckInPersonKind;
  id: string;
  name: string;
  /** Labours only: their Labour Category, named by the handlers. */
  labourCategoryId: string | null;
  /** The Labour Id or the Site Engineer's employee code. */
  code: string | null;
  phone: string | null;
  /** The record's photo (Labours and Vendors). */
  photoKey: string | null;
};

/** A check-in entry as stored, voided or not. */
export type CheckInEntry = {
  id: string;
  workspaceId: string;
  projectId: string;
  kind: CheckInPersonKind;
  personId: string;
  action: CheckInAction;
  occurredAt: Date;
  attendanceDate: CalendarDate;
  /** Null once the retention job removed the photo. */
  photoKey: string | null;
  location: DeviceFix | null;
  fence: { outsideFence: boolean; metresOutside: number } | null;
  /** The User who held the device. */
  recordedBy: string;
  voided: { at: Date; by: string; reason: string } | null;
};

export type CheckInListParams = {
  workspaceId: string;
  projectId: string;
  date: CalendarDate;
  kind?: CheckInPersonKind;
  /** Only these people (the name search); none matches nothing. */
  people?: readonly { kind: CheckInPersonKind; id: string }[];
  limit: number;
  /** Newest first; `createdAt` carries `occurredAt`. */
  after?: ListCursor;
  before?: ListCursor;
};

/** Where a person stands on a Project: their last live entry, and today's count. */
export type PersonStanding = { last: LiveEntry | null; entriesToday: number };

/**
 * Everything one person's entry does, inside one transaction that holds
 * the person's advisory lock (ADR CM-0043 §2), so their entries are
 * written one at a time.
 */
export type CheckInTransaction = {
  /** The person's last live entry on the Project. */
  lastLive(projectId: string): Promise<LiveEntry | null>;
  entry(id: string): Promise<CheckInEntry | null>;
  /** The entry, its photo's `stored_files` row and the audit event. */
  insert(
    entry: CheckInEntry,
    file: NewStoredFile,
    audit: AuditEvent,
  ): Promise<void>;
  /** False when it was voided meanwhile. */
  markVoided(
    id: string,
    voided: { at: Date; by: string; reason: string },
    audit: AuditEvent,
  ): Promise<boolean>;
  /** The person's live entries of an attendance day on the Project, oldest first. */
  liveEntriesOn(projectId: string, date: CalendarDate): Promise<LiveEntry[]>;
  /** The labourer, share-locked against a delete; null when deleted. */
  labourer(labourId: string): Promise<AttendanceLabourer | null>;
  onProject(
    labourId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<boolean>;
  /** The live day, its row locked until the transaction ends. */
  day(
    labourId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<StoredLabourDay | null>;
  /** As the sheet saves a day: row, overtime, ledger and audit. */
  saveDay(write: LabourDayWrite, by: string, now: Date): Promise<void>;
  /** As Clear on the sheet: tombstone, ledger reversal and audit. */
  clearDay(day: StoredLabourDay, by: string, now: Date): Promise<void>;
};

/** Check-In's reads and the transaction (Prisma in infrastructure). */
export type CheckInStore = {
  /** The Company's IANA time zone. */
  timeZone(workspaceId: string): Promise<string>;
  /** A live labourer with their wages, active or not. */
  labour(
    workspaceId: string,
    id: string,
  ): Promise<{
    person: CheckInPersonRecord;
    labourer: AttendanceLabourer;
  } | null>;
  labourOnProject(
    workspaceId: string,
    labourId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<boolean>;
  /** Active labourers on the Project on `date`. */
  laboursOn(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<CheckInPersonRecord[]>;
  /** A live vendor, active or not, and whether they are assigned to the Project. */
  vendor(
    workspaceId: string,
    id: string,
    projectId: string,
  ): Promise<{
    person: CheckInPersonRecord;
    isActive: boolean;
    assigned: boolean;
  } | null>;
  /** Active vendors assigned to the Project. */
  vendorsOn(
    workspaceId: string,
    projectId: string,
  ): Promise<CheckInPersonRecord[]>;
  /** Where one person stands on the Project. */
  standing(
    workspaceId: string,
    projectId: string,
    person: { kind: CheckInPersonKind; id: string },
    today: CalendarDate,
  ): Promise<PersonStanding>;
  /**
   * Where everyone with a live entry since `since` stands, in one read,
   * by `kind:id`.
   */
  standings(
    workspaceId: string,
    projectId: string,
    since: Date,
    today: CalendarDate,
  ): Promise<Map<string, PersonStanding>>;
  entry(workspaceId: string, id: string): Promise<CheckInEntry | null>;
  /** A person's entries of these attendance days, oldest first, voided ones too. */
  entriesOf(
    workspaceId: string,
    projectId: string,
    person: { kind: CheckInPersonKind; id: string },
    dates: readonly CalendarDate[],
  ): Promise<CheckInEntry[]>;
  list(
    params: CheckInListParams,
  ): Promise<{ items: CheckInEntry[]; total: number; hasMore: boolean }>;
  /** Labours and Vendors whose name contains `q`, deleted ones too. */
  partiesNamed(
    workspaceId: string,
    q: string,
  ): Promise<{ kind: "labour" | "vendor"; id: string }[]>;
  /** Names of Labours (with their category) and Vendors by id, deleted ones too. */
  partyNames(
    workspaceId: string,
    refs: readonly { kind: "labour" | "vendor"; id: string }[],
  ): Promise<Map<string, { name: string; labourCategoryId: string | null }>>;
  /** "Who did it" names by User id. */
  userNames(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
  inPerson<T>(
    workspaceId: string,
    person: { kind: CheckInPersonKind; id: string },
    work: (tx: CheckInTransaction) => Promise<T>,
  ): Promise<T>;
};

/** A Site Engineer as Check-In lists them. */
export type SiteEngineerContact = {
  id: string;
  name: string;
  mobile: string | null;
  employeeCode: string | null;
};

/**
 * Site Engineers (`construction_masters.supervisors`) as Check-In needs
 * them: the ones on a Project are enabled with their sign-in on it
 * (ADR CM-0041).
 */
export type SiteEngineerDirectory = {
  onProject(
    workspaceId: string,
    projectId: string,
  ): Promise<SiteEngineerContact[]>;
  /** Live rows among `ids`, enabled or not. */
  find(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string; disabled: boolean }>>;
  /** Names by id, deleted ones too. */
  names(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
  /** Ids whose name contains `q`, deleted ones too. */
  idsNamed(workspaceId: string, q: string): Promise<string[]>;
};

/** The Project's Site fence (HRMS Branches & Sites, ADR CM-0012). */
export type SiteFenceDirectory = {
  ofProject(workspaceId: string, projectId: string): Promise<SiteFence | null>;
};

type Ref = { id: string; name: string };

export type CheckInPersonReadModel = {
  kind: CheckInPersonKind;
  id: string;
  name: string;
  role: string | null;
  code: string | null;
  phone: string | null;
  hasPhoto: boolean;
  state: { status: "in" | "out" | "none"; since: Date | null };
  entriesToday: number;
};

export type CheckInEntryReadModel = {
  id: string;
  projectId: string;
  kind: CheckInPersonKind;
  personId: string;
  personName: string;
  role: string | null;
  action: CheckInAction;
  at: Date;
  date: CalendarDate;
  hasPhoto: boolean;
  location: {
    latitude: number;
    longitude: number;
    accuracyMetres: number | null;
  } | null;
  fence: "inside" | "outside" | null;
  metresOutside: number | null;
  recordedBy: Ref;
  voided: { at: Date; by: Ref; reason: string } | null;
};

export type CheckInDayReadModel = {
  effect: "created" | "updated" | "cleared" | "kept";
  status: AttendanceStatus | null;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number | null;
  note: string | null;
};

/** What every read carries around it. */
export type CheckInContext = {
  now: Date;
  timeZone: string;
  today: CalendarDate;
  siteFence: { name: string } | null;
};

/** What the viewer may do, from their access on the Project. */
export type CheckInViewer = { canCheckIn: boolean; canVoid: boolean };

export type RecordCheckInInput = {
  workspaceId: string;
  userId: string;
  projectId: string;
  kind: CheckInPersonKind;
  personId: string;
  action: CheckInAction;
  /** Base64 of the image. */
  photo: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracyMetres?: number | null;
  } | null;
};

/** Entries this old or newer can still decide where someone stands. */
const STANDING_WINDOW_MS = 48 * 3_600_000;

const PHOTO_FOLDER = "check-in-photos";

/** The role a Site Engineer or Vendor shows with; a Labour shows their Labour Category. */
export const ROLE_WORDS: Record<
  Exclude<CheckInPersonKind, "labour">,
  string
> = {
  site_engineer: "Site Engineer",
  vendor: "Vendor",
};

function key(kind: CheckInPersonKind, id: string): string {
  return `${kind}:${id}`;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function photoInvalid(): DomainError {
  return new DomainError(
    "PHOTO_INVALID",
    "The photo is not a JPEG, PNG or WebP image. Take it again.",
    { details: { field: "photo" } },
  );
}

/**
 * The photo sent with an entry, checked by its content (never by what the
 * client says it is) and at most 1 MB.
 */
export function readPhoto(raw: string): {
  bytes: Uint8Array;
  contentType: string;
  extension: string;
} {
  const base64 = raw.replace(/^data:[^,]*;base64,/, "").replace(/\s/g, "");
  if (base64.length === 0 || base64.length % 4 !== 0 || !BASE64.test(base64))
    throw photoInvalid();
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  try {
    const image = checkImage("check_in_photo", bytes, sniffImageType(bytes));
    return {
      bytes,
      contentType: image.contentType,
      extension: image.extension,
    };
  } catch (error) {
    if (error instanceof DomainError && error.code === "FILE_TOO_LARGE")
      throw new DomainError(
        "PHOTO_TOO_LARGE",
        "The photo must be at most 1 MB. Take it again.",
        { details: { field: "photo" } },
      );
    throw photoInvalid();
  }
}

function byName(
  a: { name: string; id: string },
  b: { name: string; id: string },
) {
  return (
    a.name.localeCompare(b.name, "en", {
      sensitivity: "base",
      numeric: true,
    }) || a.id.localeCompare(b.id)
  );
}

function dayChanged(): DomainError {
  return conflict(
    "ATTENDANCE_CHANGED",
    "This Labour's day was marked on the attendance sheet just now. Try again.",
  );
}

/**
 * Check-In on a Project (ADR CM-0043): records and voids check-in entries
 * of Labours, Vendors and Site Engineers, and a Labour's entries write
 * their attendance day in the same transaction, priced and posted as the
 * marking sheet does it. The route checks `labour.attendance` on the
 * Project; recording needs Create alone (no Update, no Back-dated Entry
 * check: the day is today, or the night shift that began yesterday).
 */
export class CheckInHandlers {
  constructor(
    private readonly store: CheckInStore,
    private readonly projects: ProjectDirectory,
    private readonly labourCategories: LabourCategoryDirectory,
    private readonly siteEngineers: SiteEngineerDirectory,
    private readonly fences: SiteFenceDirectory,
    private readonly storage: ObjectStorage,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async assertProject(
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    const found = await this.projects.find(workspaceId, [projectId]);
    if (!found.has(projectId))
      throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
  }

  private async context(
    workspaceId: string,
    projectId: string,
  ): Promise<CheckInContext & { fence: SiteFence | null }> {
    const now = this.clock();
    const [timeZone, fence] = await Promise.all([
      this.store.timeZone(workspaceId),
      this.fences.ofProject(workspaceId, projectId),
    ]);
    return {
      now,
      timeZone,
      today: todayIn(timeZone, now),
      fence,
      siteFence: fence == null ? null : { name: fence.name },
    };
  }

  /** Best effort: a leftover object costs storage, not correctness. */
  private async discard(photoKey: string): Promise<void> {
    try {
      await this.storage.delete(photoKey);
    } catch (error) {
      console.error(`Could not delete ${photoKey} from storage`, error);
    }
  }

  private async roleOf(
    workspaceId: string,
    person: CheckInPersonRecord,
  ): Promise<string | null> {
    if (person.kind !== "labour") return ROLE_WORDS[person.kind];
    if (person.labourCategoryId == null) return null;
    const found = await this.labourCategories.find(workspaceId, [
      person.labourCategoryId,
    ]);
    return found.get(person.labourCategoryId)?.name ?? null;
  }

  /**
   * The person, refused unless they may be checked in on the Project on
   * `date`: a live, active Labour on the Project that day; a live, active
   * Vendor assigned to it; an enabled Site Engineer whose sign-in is on it.
   */
  private async checkable(
    workspaceId: string,
    projectId: string,
    kind: CheckInPersonKind,
    personId: string,
    date: CalendarDate,
  ): Promise<{
    person: CheckInPersonRecord;
    labourer: AttendanceLabourer | null;
  }> {
    if (kind === "labour") {
      const found = await this.store.labour(workspaceId, personId);
      if (found == null)
        throw notFound("LABOUR_NOT_FOUND", "This Labour was not found.");
      const { person, labourer } = found;
      if (!labourer.isActive)
        throw new DomainError(
          "LABOUR_INACTIVE",
          `${person.name} is inactive. Activate them on their Labour page to check them in.`,
        );
      if (
        !(await this.store.labourOnProject(
          workspaceId,
          personId,
          projectId,
          date,
        ))
      )
        throw new DomainError(
          "LABOUR_NOT_ON_PROJECT",
          `${person.name} is not on this Project.`,
        );
      return { person, labourer };
    }
    if (kind === "vendor") {
      const found = await this.store.vendor(workspaceId, personId, projectId);
      if (found == null)
        throw notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
      if (!found.isActive)
        throw new DomainError(
          "VENDOR_INACTIVE",
          `${found.person.name} is inactive. Activate them on their Vendor page to check them in.`,
        );
      if (!found.assigned)
        throw new DomainError(
          "VENDOR_NOT_ON_PROJECT",
          `${found.person.name} is not assigned to this Project.`,
        );
      return { person: found.person, labourer: null };
    }
    const onProject = await this.siteEngineers.onProject(
      workspaceId,
      projectId,
    );
    const engineer = onProject.find((item) => item.id === personId);
    if (engineer == null) {
      const found = (
        await this.siteEngineers.find(workspaceId, [personId])
      ).get(personId);
      if (found == null)
        throw notFound(
          "SITE_ENGINEER_NOT_FOUND",
          "This Site Engineer was not found.",
        );
      if (found.disabled)
        throw new DomainError(
          "SITE_ENGINEER_DISABLED",
          `${found.name} is disabled. Enable them on their Site Engineer page to check them in.`,
        );
      throw new DomainError(
        "SITE_ENGINEER_NOT_ON_PROJECT",
        `${found.name} is not on this Project.`,
      );
    }
    return {
      person: {
        kind: "site_engineer",
        id: engineer.id,
        name: engineer.name,
        labourCategoryId: null,
        code: engineer.employeeCode,
        phone: engineer.mobile,
        photoKey: null,
      },
      labourer: null,
    };
  }

  private personModel(
    person: CheckInPersonRecord,
    role: string | null,
    standing: PersonStanding,
    now: Date,
    today: CalendarDate,
  ): CheckInPersonReadModel {
    const state = personState(standing.last, now, today);
    return {
      kind: person.kind,
      id: person.id,
      name: person.name,
      role,
      code: person.code,
      phone: person.phone,
      hasPhoto: person.kind !== "site_engineer" && person.photoKey != null,
      state: {
        status: state.status,
        since: state.status === "none" ? null : state.since,
      },
      entriesToday: standing.entriesToday,
    };
  }

  private async personNow(
    workspaceId: string,
    projectId: string,
    person: CheckInPersonRecord,
    now: Date,
    today: CalendarDate,
  ): Promise<CheckInPersonReadModel> {
    const [role, standing] = await Promise.all([
      this.roleOf(workspaceId, person),
      this.store.standing(workspaceId, projectId, person, today),
    ]);
    return this.personModel(person, role, standing, now, today);
  }

  /** Read models with people's and members' names, in one read each. */
  private async entryModels(
    workspaceId: string,
    entries: readonly CheckInEntry[],
  ): Promise<CheckInEntryReadModel[]> {
    if (entries.length === 0) return [];
    const parties = entries
      .filter((entry) => entry.kind !== "site_engineer")
      .map((entry) => ({
        kind: entry.kind as "labour" | "vendor",
        id: entry.personId,
      }));
    const engineerIds = entries
      .filter((entry) => entry.kind === "site_engineer")
      .map((entry) => entry.personId);
    const userIds = entries.flatMap((entry) =>
      entry.voided == null
        ? [entry.recordedBy]
        : [entry.recordedBy, entry.voided.by],
    );
    const [partyNames, engineerNames, users] = await Promise.all([
      this.store.partyNames(workspaceId, parties),
      this.siteEngineers.names(workspaceId, engineerIds),
      this.store.userNames(workspaceId, userIds),
    ]);
    const categoryIds = [
      ...new Set(
        [...partyNames.values()]
          .map((party) => party.labourCategoryId)
          .filter((id): id is string => id != null),
      ),
    ];
    const categories = await this.labourCategories.find(
      workspaceId,
      categoryIds,
    );
    const user = (id: string): Ref => ({ id, name: users.get(id) ?? "" });
    return entries.map((entry) => {
      const party =
        entry.kind === "site_engineer"
          ? null
          : partyNames.get(key(entry.kind, entry.personId));
      const role =
        entry.kind === "labour"
          ? party?.labourCategoryId == null
            ? null
            : (categories.get(party.labourCategoryId)?.name ?? null)
          : ROLE_WORDS[entry.kind];
      return {
        id: entry.id,
        projectId: entry.projectId,
        kind: entry.kind,
        personId: entry.personId,
        personName:
          entry.kind === "site_engineer"
            ? (engineerNames.get(entry.personId) ?? "")
            : (party?.name ?? ""),
        role,
        action: entry.action,
        at: entry.occurredAt,
        date: entry.attendanceDate,
        hasPhoto: entry.photoKey != null,
        location:
          entry.location == null
            ? null
            : {
                latitude: entry.location.latitude,
                longitude: entry.location.longitude,
                accuracyMetres: entry.location.accuracyMetres,
              },
        fence:
          entry.fence == null
            ? null
            : entry.fence.outsideFence
              ? "outside"
              : "inside",
        metresOutside: entry.fence?.metresOutside ?? null,
        recordedBy: user(entry.recordedBy),
        voided:
          entry.voided == null
            ? null
            : {
                at: entry.voided.at,
                by: user(entry.voided.by),
                reason: entry.voided.reason,
              },
      };
    });
  }

  private async entryModel(
    workspaceId: string,
    entry: CheckInEntry,
  ): Promise<CheckInEntryReadModel> {
    const [model] = await this.entryModels(workspaceId, [entry]);
    if (model == null) throw new Error("unreachable");
    return model;
  }

  /**
   * Works a Labour's attendance day out again from their live entries of
   * that day (ADR CM-0043 §3), inside the entry's transaction.
   */
  private async workOutDay(
    tx: CheckInTransaction,
    input: {
      labourId: string;
      projectId: string;
      date: CalendarDate;
      cause: CheckInAction | "void";
      timeZone: string;
      by: string;
      now: Date;
    },
  ): Promise<CheckInDayReadModel> {
    const { labourId, projectId, date, by, now } = input;
    const entries = await tx.liveEntriesOn(projectId, date);
    const times = timesFromEntries(entries, input.timeZone);
    // The labourer's share lock before the day's row lock, the order the
    // sheet's save takes them in.
    const labourer = await tx.labourer(labourId);
    const stored = await tx.day(labourId, projectId, date);
    const effect: DayEffect = dayEffect({
      day:
        stored == null
          ? null
          : {
              status: stored.status,
              checkIn: stored.checkIn,
              fromCheckIn: stored.fromCheckIn,
              timesFromCheckIn: stored.timesFromCheckIn,
            },
      times,
      cause: input.cause,
    });
    const saved = (day: PricedDay, effect: "created" | "updated") => ({
      effect,
      status: day.status,
      checkIn: day.checkIn,
      checkOut: day.checkOut,
      breakMinutes: day.breakMinutes,
      note: null,
    });
    switch (effect.kind) {
      case "keep":
        return {
          effect: "kept",
          status: stored?.status ?? null,
          checkIn: stored?.checkIn ?? null,
          checkOut: stored?.checkOut ?? null,
          breakMinutes: stored?.breakMinutes ?? null,
          note: dayKeptNote(effect.reason, stored?.status ?? null),
        };
      case "clear": {
        if (stored == null) throw new Error("unreachable");
        await tx.clearDay(stored, by, now);
        return {
          effect: "cleared",
          status: null,
          checkIn: null,
          checkOut: null,
          breakMinutes: null,
          note: null,
        };
      }
      case "create": {
        if (labourer == null) throw labourNotFound();
        const day: PricedDay = {
          ...priceDay({
            mark: createdDayMark({
              labourId,
              times: effect.times,
              labourCategoryId: labourer.labourCategoryId,
            }),
            card: labourer.card,
            projectId,
            date,
            supervisorId: null,
          }),
          fromCheckIn: true,
          timesFromCheckIn: true,
        };
        try {
          await tx.saveDay(
            { id: newId(now.getTime()), day, expectedUpdatedAt: null },
            by,
            now,
          );
        } catch (error) {
          if (
            error instanceof DomainError &&
            error.code === "ATTENDANCE_CHANGED"
          )
            throw dayChanged();
          throw error;
        }
        return saved(day, "created");
      }
      case "set_times": {
        if (stored == null) throw new Error("unreachable");
        if (labourer == null) throw labourNotFound();
        const day: PricedDay = {
          ...priceDay({
            mark: timesDayMark({
              day: stored,
              times: effect.times,
              labourCategoryId: labourer.labourCategoryId,
            }),
            card: labourer.card,
            projectId,
            date,
            supervisorId: stored.supervisorId,
          }),
          fromCheckIn: stored.fromCheckIn,
          timesFromCheckIn: effect.times != null,
        };
        await tx.saveDay(
          { id: stored.id, day, expectedUpdatedAt: stored.updatedAt },
          by,
          now,
        );
        return saved(day, "updated");
      }
    }
  }

  /**
   * Records a Check In or Check Out with its photo (ADR CM-0043 §1–§3).
   * The same action within two minutes writes nothing and answers with the
   * entry already there (`repeated`). A refusal or a repeat seen before the
   * upload stores no photo; one seen inside the transaction discards it.
   */
  async record(input: RecordCheckInInput): Promise<{
    entry: CheckInEntryReadModel;
    repeated: boolean;
    person: CheckInPersonReadModel;
    day: CheckInDayReadModel | null;
  }> {
    const { workspaceId, projectId, kind, personId, action } = input;
    await this.assertProject(workspaceId, projectId);
    const photo = readPhoto(input.photo);
    const fix = readDeviceFix(input.location ?? {});
    const { now, timeZone, today, fence } = await this.context(
      workspaceId,
      projectId,
    );
    const who = { kind, id: personId };

    // A first look without the lock: a refusal or a repeat uploads nothing.
    let peek: EntryDecision | DomainError;
    try {
      peek = decideEntry({
        action,
        last: (await this.store.standing(workspaceId, projectId, who, today))
          .last,
        now,
        today,
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      peek = error;
    }
    const found = await this.checkable(
      workspaceId,
      projectId,
      kind,
      personId,
      peek instanceof DomainError ? today : peek.attendanceDate,
    );
    if (peek instanceof DomainError) throw peek;
    if (peek.kind === "repeat")
      return this.repeatOf(
        workspaceId,
        projectId,
        found.person,
        peek.entryId,
        now,
        today,
      );

    const compared = compareWithFence(fence, fix);
    const photoKey = companyFileKey(workspaceId, PHOTO_FOLDER, photo.extension);
    await this.storage.put(photoKey, photo.bytes, photo.contentType);
    let outcome:
      | { repeated: string }
      | { entry: CheckInEntry; day: CheckInDayReadModel | null };
    try {
      outcome = await this.store.inPerson(workspaceId, who, async (tx) => {
        // The entry's time is read once the person's lock is held, so
        // entries are written in the order their times say, however long
        // a photo took to upload.
        const at = this.clock();
        const decision = decideEntry({
          action,
          last: await tx.lastLive(projectId),
          now: at,
          today: todayIn(timeZone, at),
        });
        if (decision.kind === "repeat") return { repeated: decision.entryId };
        if (
          kind === "labour" &&
          !(await tx.onProject(personId, projectId, decision.attendanceDate))
        )
          throw new DomainError(
            "LABOUR_NOT_ON_PROJECT",
            `${found.person.name} is not on this Project.`,
          );
        const entry: CheckInEntry = {
          id: newId(at.getTime()),
          workspaceId,
          projectId,
          kind,
          personId,
          action,
          occurredAt: at,
          attendanceDate: decision.attendanceDate,
          photoKey,
          location: fix,
          fence: compared,
          recordedBy: input.userId,
          voided: null,
        };
        await tx.insert(
          entry,
          {
            workspaceId,
            key: photoKey,
            kind: "check_in_photo",
            contentType: photo.contentType,
            bytes: photo.bytes.byteLength,
            createdBy: input.userId,
            createdAt: at,
          },
          {
            workspaceId,
            actorUserId: input.userId,
            action: "check_in.recorded",
            entityType: "check_in",
            entityId: entry.id,
            after: {
              projectId,
              kind,
              personId,
              action,
              attendanceDate: entry.attendanceDate,
              location: fix,
              fence: compared,
            },
            occurredAt: at,
          },
        );
        const day =
          kind === "labour"
            ? await this.workOutDay(tx, {
                labourId: personId,
                projectId,
                date: entry.attendanceDate,
                cause: action,
                timeZone,
                by: input.userId,
                now: at,
              })
            : null;
        return { entry, day };
      });
    } catch (error) {
      await this.discard(photoKey);
      throw error;
    }
    if ("repeated" in outcome) {
      await this.discard(photoKey);
      return this.repeatOf(
        workspaceId,
        projectId,
        found.person,
        outcome.repeated,
        now,
        today,
      );
    }
    const [entry, person] = await Promise.all([
      this.entryModel(workspaceId, outcome.entry),
      this.personNow(
        workspaceId,
        projectId,
        found.person,
        outcome.entry.occurredAt,
        todayIn(timeZone, outcome.entry.occurredAt),
      ),
    ]);
    return { entry, repeated: false, person, day: outcome.day };
  }

  /** The answer to a repeat: the entry already there; nothing was written. */
  private async repeatOf(
    workspaceId: string,
    projectId: string,
    person: CheckInPersonRecord,
    entryId: string,
    now: Date,
    today: CalendarDate,
  ) {
    const stored = await this.store.entry(workspaceId, entryId);
    if (stored == null) throw new Error(`Check-in ${entryId} vanished`);
    const [entry, model] = await Promise.all([
      this.entryModel(workspaceId, stored),
      this.personNow(workspaceId, projectId, person, now, today),
    ]);
    return { entry, repeated: true, person: model, day: null };
  }

  /** The entry, for the route's project-scoped check; 404 for another Company's. */
  async find(workspaceId: string, id: string): Promise<CheckInEntry> {
    const entry = await this.store.entry(workspaceId, id);
    if (entry == null)
      throw notFound(
        "CHECK_IN_NOT_FOUND",
        "This check-in entry was not found.",
      );
    return entry;
  }

  /**
   * Voids an entry with a reason (ADR CM-0043 §1, §3): the row stays, with
   * who voided it and why, and a Labour's day is worked out again from the
   * entries left. The photo stays until retention removes it.
   */
  async void(input: {
    workspaceId: string;
    userId: string;
    id: string;
    reason: string;
  }): Promise<{
    entry: CheckInEntryReadModel;
    person: CheckInPersonReadModel;
    day: CheckInDayReadModel | null;
  }> {
    const { workspaceId } = input;
    const found = await this.find(workspaceId, input.id);
    const reason = voidReason(input.reason);
    if (found.voided != null) throw alreadyVoided();
    const { now, timeZone, today } = await this.context(
      workspaceId,
      found.projectId,
    );
    const who = { kind: found.kind, id: found.personId };
    const outcome = await this.store.inPerson(workspaceId, who, async (tx) => {
      const voided = { at: now, by: input.userId, reason };
      const changed = await tx.markVoided(found.id, voided, {
        workspaceId,
        actorUserId: input.userId,
        action: "check_in.voided",
        entityType: "check_in",
        entityId: found.id,
        before: { voidedAt: null },
        after: { voidedAt: now, reason },
        occurredAt: now,
      });
      if (!changed) throw alreadyVoided();
      const day =
        found.kind === "labour"
          ? await this.workOutDay(tx, {
              labourId: found.personId,
              projectId: found.projectId,
              date: found.attendanceDate,
              cause: "void",
              timeZone,
              by: input.userId,
              now,
            })
          : null;
      return { entry: { ...found, voided }, day };
    });
    const person = await this.recordOf(workspaceId, found);
    const [entry, model] = await Promise.all([
      this.entryModel(workspaceId, outcome.entry),
      this.personNow(workspaceId, found.projectId, person, now, today),
    ]);
    return { entry, person: model, day: outcome.day };
  }

  /**
   * The person an entry names as they are now, whether or not they may
   * still be checked in (a void works on an entry of someone since moved).
   */
  private async recordOf(
    workspaceId: string,
    entry: CheckInEntry,
  ): Promise<CheckInPersonRecord> {
    if (entry.kind === "labour") {
      const found = await this.store.labour(workspaceId, entry.personId);
      if (found != null) return found.person;
    } else if (entry.kind === "vendor") {
      const found = await this.store.vendor(
        workspaceId,
        entry.personId,
        entry.projectId,
      );
      if (found != null) return found.person;
    } else {
      const onProject = await this.siteEngineers.onProject(
        workspaceId,
        entry.projectId,
      );
      const engineer = onProject.find((item) => item.id === entry.personId);
      if (engineer != null)
        return {
          kind: "site_engineer",
          id: engineer.id,
          name: engineer.name,
          labourCategoryId: null,
          code: engineer.employeeCode,
          phone: engineer.mobile,
          photoKey: null,
        };
    }
    const [model] = await this.entryModels(workspaceId, [entry]);
    return {
      kind: entry.kind,
      id: entry.personId,
      name: model?.personName ?? "",
      labourCategoryId: null,
      code: null,
      phone: null,
      photoKey: null,
    };
  }

  /**
   * The find screen: the Project's Site Engineers, Labours on it today and
   * Vendors assigned to it, each group by name, with where each one stands.
   */
  async people(
    workspaceId: string,
    projectId: string,
    viewer: CheckInViewer,
  ): Promise<
    CheckInContext &
      CheckInViewer & {
        siteEngineers: CheckInPersonReadModel[];
        labours: CheckInPersonReadModel[];
        vendors: CheckInPersonReadModel[];
      }
  > {
    await this.assertProject(workspaceId, projectId);
    const { fence: _fence, ...context } = await this.context(
      workspaceId,
      projectId,
    );
    const { now, today } = context;
    const [labours, engineers, vendors, standings] = await Promise.all([
      this.store.laboursOn(workspaceId, projectId, today),
      this.siteEngineers.onProject(workspaceId, projectId),
      this.store.vendorsOn(workspaceId, projectId),
      this.store.standings(
        workspaceId,
        projectId,
        new Date(now.getTime() - STANDING_WINDOW_MS),
        today,
      ),
    ]);
    const categories = await this.labourCategories.find(workspaceId, [
      ...new Set(
        labours
          .map((labour) => labour.labourCategoryId)
          .filter((id): id is string => id != null),
      ),
    ]);
    const none: PersonStanding = { last: null, entriesToday: 0 };
    const model = (person: CheckInPersonRecord, role: string | null) =>
      this.personModel(
        person,
        role,
        standings.get(key(person.kind, person.id)) ?? none,
        now,
        today,
      );
    return {
      ...context,
      ...viewer,
      siteEngineers: engineers
        .map((engineer) =>
          model(
            {
              kind: "site_engineer",
              id: engineer.id,
              name: engineer.name,
              labourCategoryId: null,
              code: engineer.employeeCode,
              phone: engineer.mobile,
              photoKey: null,
            },
            ROLE_WORDS.site_engineer,
          ),
        )
        .sort(byName),
      labours: labours
        .map((labour) =>
          model(
            labour,
            labour.labourCategoryId == null
              ? null
              : (categories.get(labour.labourCategoryId)?.name ?? null),
          ),
        )
        .sort(byName),
      vendors: vendors
        .map((vendor) => model(vendor, ROLE_WORDS.vendor))
        .sort(byName),
    };
  }

  /**
   * The capture screen: one person (refused as recording would refuse
   * them), with their entries of today's attendance day and of a still
   * open earlier day, oldest first, voided ones included.
   */
  async capture(
    workspaceId: string,
    projectId: string,
    kind: CheckInPersonKind,
    personId: string,
    viewer: CheckInViewer,
  ): Promise<
    CheckInContext &
      CheckInViewer & {
        person: CheckInPersonReadModel;
        entries: CheckInEntryReadModel[];
      }
  > {
    await this.assertProject(workspaceId, projectId);
    const { fence: _fence, ...context } = await this.context(
      workspaceId,
      projectId,
    );
    const { now, today } = context;
    const who = { kind, id: personId };
    const standing = await this.store.standing(
      workspaceId,
      projectId,
      who,
      today,
    );
    const state = personState(standing.last, now, today);
    const openDate =
      state.status === "in" && state.attendanceDate !== today
        ? state.attendanceDate
        : null;
    const found = await this.checkable(
      workspaceId,
      projectId,
      kind,
      personId,
      openDate ?? today,
    );
    const [role, entries] = await Promise.all([
      this.roleOf(workspaceId, found.person),
      this.store.entriesOf(
        workspaceId,
        projectId,
        who,
        openDate == null ? [today] : [openDate, today],
      ),
    ]);
    return {
      ...context,
      ...viewer,
      person: this.personModel(found.person, role, standing, now, today),
      entries: await this.entryModels(workspaceId, entries),
    };
  }

  /**
   * The Check-In log: a day's entries, newest first, voided ones included,
   * by kind and part of the person's name, with cursors and a total.
   */
  async log(
    params: Omit<CheckInListParams, "date" | "people"> & {
      date?: CalendarDate;
      q?: string;
    },
    viewer: CheckInViewer,
  ): Promise<
    CheckInContext &
      CheckInViewer & {
        date: CalendarDate;
        items: CheckInEntryReadModel[];
        total: number;
        hasMore: boolean;
      }
  > {
    const { workspaceId, projectId } = params;
    await this.assertProject(workspaceId, projectId);
    const { fence: _fence, ...context } = await this.context(
      workspaceId,
      projectId,
    );
    const date =
      params.date == null
        ? context.today
        : assertCalendarDate(params.date, "DATE_INVALID");
    if (daysBetween(context.today, date) > 0)
      throw new DomainError(
        "DATE_IN_FUTURE",
        "There are no check-in entries for a future date.",
        { details: { date, today: context.today } },
      );
    const q = params.q?.trim() ?? "";
    let people: { kind: CheckInPersonKind; id: string }[] | undefined;
    if (q.length > 0) {
      const [parties, engineerIds] = await Promise.all([
        this.store.partiesNamed(workspaceId, q),
        this.siteEngineers.idsNamed(workspaceId, q),
      ]);
      people = [
        ...parties,
        ...engineerIds.map((id) => ({ kind: "site_engineer" as const, id })),
      ];
    }
    const page =
      people?.length === 0
        ? { items: [], total: 0, hasMore: false }
        : await this.store.list({
            workspaceId,
            projectId,
            date,
            kind: params.kind,
            people,
            limit: params.limit,
            after: params.after,
            before: params.before,
          });
    return {
      ...context,
      ...viewer,
      date,
      items: await this.entryModels(workspaceId, page.items),
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  /** The entry's photo; 404 once retention removed it. */
  async photo(workspaceId: string, id: string): Promise<StoredObject> {
    const entry = await this.find(workspaceId, id);
    if (entry.photoKey == null) throw photoNotFound();
    const object = await this.storage.get(entry.photoKey);
    if (object == null) throw photoNotFound();
    return object;
  }

  /**
   * A Labour's or Vendor's record photo, for the capture screen: only for
   * someone on the Project; a Site Engineer has none here.
   */
  async recordPhoto(
    workspaceId: string,
    projectId: string,
    kind: CheckInPersonKind,
    personId: string,
  ): Promise<StoredObject> {
    await this.assertProject(workspaceId, projectId);
    if (kind === "site_engineer") throw photoNotFound();
    let photoKey: string | null;
    if (kind === "labour") {
      const found = await this.store.labour(workspaceId, personId);
      if (found == null)
        throw notFound("LABOUR_NOT_FOUND", "This Labour was not found.");
      const today = todayIn(
        await this.store.timeZone(workspaceId),
        this.clock(),
      );
      // Today or yesterday: a night shift's Labour is still shown.
      const on =
        (await this.store.labourOnProject(
          workspaceId,
          personId,
          projectId,
          today,
        )) ||
        (await this.store.labourOnProject(
          workspaceId,
          personId,
          projectId,
          addDays(today, -1),
        ));
      if (!on) throw photoNotFound();
      photoKey = found.person.photoKey;
    } else {
      const found = await this.store.vendor(workspaceId, personId, projectId);
      if (found == null)
        throw notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
      if (!found.assigned) throw photoNotFound();
      photoKey = found.person.photoKey;
    }
    if (photoKey == null) throw photoNotFound();
    const object = await this.storage.get(photoKey);
    if (object == null) throw photoNotFound();
    return object;
  }
}

function labourNotFound(): DomainError {
  return notFound("LABOUR_NOT_FOUND", "This Labour was not found.");
}

function alreadyVoided(): DomainError {
  return conflict(
    "CHECK_IN_ALREADY_VOIDED",
    "This check-in entry was already voided.",
  );
}

function photoNotFound(): DomainError {
  return notFound("PHOTO_NOT_FOUND", "There is no photo.");
}
