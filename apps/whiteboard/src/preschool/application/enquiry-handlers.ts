import { ageText, normaliseEmail, type Gender } from "../domain/child";
import { todayInIndia, type IsoDate } from "../domain/dates";
import {
  assertCanMarkLost,
  assertCanReopen,
  assertEnquiryEditable,
  assertEnquiryOpen,
  ENQUIRY_STATUSES,
  isFollowUpDue,
  moveEnquiry,
  OPEN_ENQUIRY_STATUSES,
  statusBeforeLost,
  type EnquiryListFilter,
  type EnquirySource,
  type EnquiryStatus,
  type FollowUpKind,
  type MovableEnquiryStatus,
} from "../domain/enquiry";
import { conflict, invalid, notFound } from "../domain/errors";
import { indianMobile, normaliseIndianMobile } from "../domain/phone";
import { assertManagerOf, type PreschoolActor } from "./access";
import type {
  EnquiryChange,
  EnquiryDetails,
  EnquiryReader,
  EnquiryRecord,
  EnquiryStore,
  NewEnquiryActivity,
} from "./enquiry-ports";
import type {
  EnquiryDetailView,
  EnquiryPageView,
  EnquiryPhoneMatchesView,
  EnquirySummaryView,
  EnquiryView,
} from "./enquiry-views";
import { decodeCursor, DEFAULT_PAGE_SIZE, pageFrom } from "./list-cursor";

export type EnquiryInput = {
  childName: string;
  childDateOfBirth?: IsoDate | null;
  childGender?: Gender | null;
  parentName: string;
  /** An Indian mobile number in any common spelling; stored as 10 digits. */
  parentPhone: string;
  parentEmail?: string | null;
  programmeId?: string | null;
  source: EnquirySource;
  notes?: string | null;
};

export type CreateEnquiryInput = EnquiryInput & {
  centreId: string;
  nextFollowUpOn?: IsoDate | null;
};

export type ListEnquiriesInput = {
  centreId: string;
  status?: EnquiryStatus;
  view?: EnquiryListFilter;
  q?: string;
  limit?: number;
  cursor?: string;
};

export type FollowUpInput = {
  kind: FollowUpKind;
  note: string;
  /** Leave out to keep the date; null clears it. */
  nextFollowUpOn?: IsoDate | null;
  status?: MovableEnquiryStatus;
  visitOn?: IsoDate | null;
};

export type MoveEnquiryInput = {
  status: MovableEnquiryStatus;
  visitOn?: IsoDate | null;
  note?: string | null;
  nextFollowUpOn?: IsoDate | null;
};

function textOrNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text === "" ? null : text;
}

function enquiryNotFound() {
  return notFound("ENQUIRY_NOT_FOUND", "Enquiry not found.");
}

/** Enquiries of a Centre: the Owner and the Centre's Centre Head only. */
export class EnquiryHandlers {
  constructor(
    private readonly deps: {
      store: EnquiryStore;
      reader: EnquiryReader;
      now: () => Date;
      newId?: () => string;
    },
  ) {}

  private today(): IsoDate {
    return todayInIndia(this.deps.now());
  }

  private view(record: EnquiryRecord, today: IsoDate): EnquiryView {
    return {
      ...record,
      childAgeText:
        record.childDateOfBirth == null
          ? null
          : ageText(record.childDateOfBirth, today),
      followUpDue: isFollowUpDue(record, today),
    };
  }

  async list(
    actor: PreschoolActor,
    input: ListEnquiriesInput,
  ): Promise<EnquiryPageView> {
    assertManagerOf(actor, input.centreId);
    const today = this.today();
    const limit = input.limit ?? DEFAULT_PAGE_SIZE;
    const { rows, total } = await this.deps.reader.list({
      workspaceId: actor.workspaceId,
      centreId: input.centreId,
      status: input.status ?? null,
      filter: input.view ?? "all",
      q: textOrNull(input.q),
      limit,
      after: input.cursor == null ? null : decodeCursor(input.cursor),
      today,
    });
    const page = pageFrom(rows, limit, total, (row) => ({
      key: row.createdAt,
      id: row.id,
    }));
    return { ...page, items: page.items.map((row) => this.view(row, today)) };
  }

  async summary(
    actor: PreschoolActor,
    centreId: string,
  ): Promise<EnquirySummaryView> {
    assertManagerOf(actor, centreId);
    const { workspaceId } = actor;
    const [counts, followUpsDue] = await Promise.all([
      this.deps.reader.countByStatus(workspaceId, centreId),
      this.deps.reader.countFollowUpsDue(workspaceId, centreId, this.today()),
    ]);
    const byStatus = Object.fromEntries(
      ENQUIRY_STATUSES.map((status) => [status, counts[status] ?? 0]),
    ) as Record<EnquiryStatus, number>;
    return {
      centreId,
      byStatus,
      open: OPEN_ENQUIRY_STATUSES.reduce(
        (sum, status) => sum + byStatus[status],
        0,
      ),
      followUpsDue,
    };
  }

  async get(actor: PreschoolActor, id: string): Promise<EnquiryDetailView> {
    const record = await this.deps.reader.get(actor.workspaceId, id);
    if (record == null) throw enquiryNotFound();
    assertManagerOf(actor, record.centreId);
    const activities = await this.deps.reader.activities(id);
    return { ...this.view(record, this.today()), activities };
  }

  /** Empty until the phone is a whole Indian mobile number. */
  async phoneMatches(
    actor: PreschoolActor,
    input: { centreId: string; phone: string; excludeEnquiryId?: string },
  ): Promise<EnquiryPhoneMatchesView> {
    assertManagerOf(actor, input.centreId);
    const phone = normaliseIndianMobile(input.phone);
    if (phone == null) return { enquiries: [], children: [] };
    return this.deps.reader.phoneMatches(
      actor.workspaceId,
      input.centreId,
      phone,
      input.excludeEnquiryId ?? null,
    );
  }

  async create(
    actor: PreschoolActor,
    input: CreateEnquiryInput,
  ): Promise<EnquiryDetailView> {
    assertManagerOf(actor, input.centreId);
    const details = this.details(input);
    const id = (this.deps.newId ?? (() => crypto.randomUUID()))();
    await this.deps.store.transaction(async (store) => {
      await this.assertProgramme(store, actor, details.programmeId, null);
      await store.insert({
        ...details,
        id,
        workspaceId: actor.workspaceId,
        centreId: input.centreId,
        nextFollowUpOn: input.nextFollowUpOn ?? null,
        createdByUserId: actor.userId,
      });
      await this.log(store, actor, id, [
        { kind: "status_change", note: null, toStatus: "new" },
      ]);
    });
    return this.get(actor, id);
  }

  async updateDetails(
    actor: PreschoolActor,
    id: string,
    input: EnquiryInput,
  ): Promise<EnquiryDetailView> {
    const details = this.details(input);
    await this.withEnquiry(actor, id, async (store, enquiry) => {
      assertEnquiryEditable(enquiry.status);
      await this.assertProgramme(
        store,
        actor,
        details.programmeId,
        enquiry.programmeId,
      );
      await store.update(actor.workspaceId, id, details);
      await this.log(store, actor, id, [
        { kind: "note", note: "Details updated.", toStatus: null },
      ]);
    });
    return this.get(actor, id);
  }

  /** A call, visit or note, optionally moving the status on. */
  async logFollowUp(
    actor: PreschoolActor,
    id: string,
    input: FollowUpInput,
  ): Promise<EnquiryDetailView> {
    await this.withEnquiry(actor, id, async (store, enquiry) => {
      assertEnquiryOpen(enquiry.status);
      const change: EnquiryChange = {};
      const activities: NewEnquiryActivity[] = [
        { kind: input.kind, note: input.note, toStatus: null },
      ];
      if (input.status != null) {
        const moved = moveEnquiry(
          enquiry,
          input.status,
          { visitOn: input.visitOn },
          this.today(),
        );
        Object.assign(change, moved);
        activities.push({
          kind: "status_change",
          note: null,
          toStatus: moved.status,
        });
      }
      if (input.nextFollowUpOn !== undefined)
        change.nextFollowUpOn = input.nextFollowUpOn;
      await store.update(actor.workspaceId, id, change);
      await this.log(store, actor, id, activities);
    });
    return this.get(actor, id);
  }

  async moveStatus(
    actor: PreschoolActor,
    id: string,
    input: MoveEnquiryInput,
  ): Promise<EnquiryDetailView> {
    await this.withEnquiry(actor, id, async (store, enquiry) => {
      const moved = moveEnquiry(
        enquiry,
        input.status,
        { visitOn: input.visitOn },
        this.today(),
      );
      const change: EnquiryChange = { ...moved };
      if (input.nextFollowUpOn !== undefined)
        change.nextFollowUpOn = input.nextFollowUpOn;
      await store.update(actor.workspaceId, id, change);
      await this.log(store, actor, id, [
        {
          kind: "status_change",
          note: textOrNull(input.note),
          toStatus: moved.status,
        },
      ]);
    });
    return this.get(actor, id);
  }

  async markLost(
    actor: PreschoolActor,
    id: string,
    input: { reason: string },
  ): Promise<EnquiryDetailView> {
    const reason = input.reason.trim();
    if (reason === "")
      throw invalid("LOST_REASON_REQUIRED", "Say why the Enquiry was lost.");
    await this.withEnquiry(actor, id, async (store, enquiry) => {
      assertCanMarkLost(enquiry.status);
      await store.update(actor.workspaceId, id, {
        status: "lost",
        lostReason: reason,
        nextFollowUpOn: null,
      });
      await this.log(store, actor, id, [
        { kind: "status_change", note: reason, toStatus: "lost" },
      ]);
    });
    return this.get(actor, id);
  }

  /** Back to the open status it had when it was lost. */
  async reopen(
    actor: PreschoolActor,
    id: string,
    input: { nextFollowUpOn?: IsoDate | null; note?: string | null },
  ): Promise<EnquiryDetailView> {
    await this.withEnquiry(actor, id, async (store, enquiry) => {
      assertCanReopen(enquiry.status);
      const status = statusBeforeLost(await store.statusHistory(id));
      await store.update(actor.workspaceId, id, {
        status,
        lostReason: null,
        nextFollowUpOn: input.nextFollowUpOn ?? null,
      });
      await this.log(store, actor, id, [
        {
          kind: "status_change",
          note: textOrNull(input.note),
          toStatus: status,
        },
      ]);
    });
    return this.get(actor, id);
  }

  private details(input: EnquiryInput): EnquiryDetails {
    const childDateOfBirth = input.childDateOfBirth ?? null;
    if (childDateOfBirth != null && childDateOfBirth > this.today())
      throw invalid(
        "DATE_OF_BIRTH_IN_FUTURE",
        "The date of birth cannot be in the future.",
      );
    return {
      childName: input.childName.trim(),
      childDateOfBirth,
      childGender: input.childGender ?? null,
      parentName: input.parentName.trim(),
      parentPhone: indianMobile(input.parentPhone, "parentPhone"),
      parentEmail: normaliseEmail(input.parentEmail),
      programmeId: input.programmeId ?? null,
      source: input.source,
      notes: textOrNull(input.notes),
    };
  }

  /** A newly chosen Programme must exist and not be archived. */
  private async assertProgramme(
    store: EnquiryStore,
    actor: PreschoolActor,
    programmeId: string | null,
    previous: string | null,
  ): Promise<void> {
    if (programmeId == null || programmeId === previous) return;
    const programme = await store.programme(actor.workspaceId, programmeId);
    if (programme == null)
      throw notFound("PROGRAMME_NOT_FOUND", "Programme not found.");
    if (programme.archived)
      throw conflict("PROGRAMME_ARCHIVED", "The Programme is archived.");
  }

  private log(
    store: EnquiryStore,
    actor: PreschoolActor,
    id: string,
    activities: NewEnquiryActivity[],
  ): Promise<void> {
    return store.addActivities(
      actor.workspaceId,
      id,
      { userId: actor.userId, userName: actor.userName },
      this.deps.now(),
      activities,
    );
  }

  private withEnquiry(
    actor: PreschoolActor,
    id: string,
    work: (
      store: EnquiryStore,
      enquiry: NonNullable<Awaited<ReturnType<EnquiryStore["lock"]>>>,
    ) => Promise<void>,
  ): Promise<void> {
    return this.deps.store.transaction(async (store) => {
      const enquiry = await store.lock(actor.workspaceId, id);
      if (enquiry == null) throw enquiryNotFound();
      assertManagerOf(actor, enquiry.centreId);
      await work(store, enquiry);
    });
  }
}
