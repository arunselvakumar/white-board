import {
  addCalendarDays,
  classesOn,
  daysBetween,
  hasStarted,
  isCalendarDate,
  localNow,
} from "../domain/class-schedule";
import { ENQUIRY_TIMEZONE, isFollowUpDue } from "../domain/enquiry";
import { DomainError } from "../domain/errors";
import type { EnquiryReader, EnquiryStore } from "./enquiry-ports";
import type {
  DemoSlotView,
  DemoView,
  EnquiryActor,
  EnquiryDetailView,
  EnquiryListFilter,
  EnquiryListView,
  EnquiryOptionsView,
  EnquiryRecord,
  EnquirySourceView,
  EnquirySummaryView,
  EnquiryView,
  PhoneMatchesView,
} from "./enquiry-views";
import { decodeListCursor, encodeListCursor } from "./list-cursor";
import { BatchNotFoundError } from "./not-found-error";

export const MAX_DEMO_RANGE_DAYS = 31;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Digits only, last 10: "+91 98765-43210" and "9876543210" match. */
export function phoneMatchKey(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/** A calendar month in Asia/Kolkata, as UTC instants and local dates. */
export function enquiryMonth(month: string): {
  month: string;
  firstDay: string;
  lastDay: string;
  from: Date;
  to: Date;
} {
  const match = MONTH_RE.exec(month);
  if (match == null)
    throw new DomainError(
      "ENQUIRY_SUMMARY_MONTH_INVALID",
      "Month must look like 2026-10.",
    );
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const firstDay = `${month}-01`;
  const nextFirstDay =
    monthNumber === 12
      ? `${String(year + 1)}-01-01`
      : `${String(year)}-${String(monthNumber + 1).padStart(2, "0")}-01`;
  // Asia/Kolkata has no daylight saving: local midnight is 18:30 UTC the day before.
  return {
    month,
    firstDay,
    lastDay: addCalendarDays(nextFirstDay, -1),
    from: new Date(`${firstDay}T00:00:00+05:30`),
    to: new Date(`${nextFirstDay}T00:00:00+05:30`),
  };
}

function notFound(code: string, message: string): DomainError {
  return new DomainError(code, message);
}

/** Reads for Enquiries, demos, Sources, and the monthly summary. */
export class EnquiryQueries {
  constructor(
    private readonly deps: {
      reader: EnquiryReader;
      now: () => Date;
      schedule?: Pick<EnquiryStore, "findScheduleBatch" | "classExceptions">;
    },
  ) {}

  private today(): string {
    return localNow(this.deps.now(), ENQUIRY_TIMEZONE).date;
  }

  private view(record: EnquiryRecord, today: string): EnquiryView {
    return {
      ...record,
      followUpDue: isFollowUpDue(record.stage, record.nextFollowUpOn, today),
    };
  }

  async list(
    actor: EnquiryActor,
    input: {
      view?: EnquiryListFilter;
      q?: string | null;
      limit?: number;
      after?: string | null;
      before?: string | null;
    },
  ): Promise<EnquiryListView> {
    const today = this.today();
    const after =
      input.after == null
        ? undefined
        : decodeListCursor(input.after, (id) => id);
    const before =
      input.before == null
        ? undefined
        : decodeListCursor(input.before, (id) => id);
    const q = input.q?.trim();
    const page = await this.deps.reader.list({
      workspaceId: actor.workspaceId,
      view: input.view ?? "open",
      q: q == null || q.length === 0 ? null : q,
      limit: input.limit ?? 20,
      after,
      before,
      today,
    });
    const first = page.items[0];
    const last = page.items[page.items.length - 1];
    const cursor = (item: { createdAtDate: Date; id: string }) =>
      encodeListCursor({
        createdAt: item.createdAtDate,
        id: { value: item.id },
      });
    return {
      items: page.items.map(({ createdAtDate: _createdAt, ...record }) =>
        this.view(record, today),
      ),
      nextCursor:
        last != null && (before != null || page.hasMore) ? cursor(last) : null,
      prevCursor:
        first != null && (after != null || (before != null && page.hasMore))
          ? cursor(first)
          : null,
      total: page.total,
    };
  }

  async enquiry(actor: EnquiryActor, id: string): Promise<EnquiryView> {
    const record = await this.deps.reader.get(actor.workspaceId, id);
    if (record == null)
      throw notFound("ENQUIRY_NOT_FOUND", "Enquiry not found.");
    return this.view(record, this.today());
  }

  async detail(actor: EnquiryActor, id: string): Promise<EnquiryDetailView> {
    const enquiry = await this.enquiry(actor, id);
    const [history, demos] = await Promise.all([
      this.deps.reader.history(actor.workspaceId, id),
      this.deps.reader.demosOf(actor.workspaceId, id),
    ]);
    return { ...enquiry, history, demos };
  }

  async demo(actor: EnquiryActor, id: string): Promise<DemoView> {
    const demo = await this.deps.reader.demo(actor.workspaceId, id);
    if (demo == null) throw notFound("DEMO_NOT_FOUND", "Demo not found.");
    return demo;
  }

  /**
   * Booked demos in a date range. The Owner sees every demo; a Teacher sees
   * one-to-one demos with them and demos in Batches they're assigned to.
   */
  async demos(
    actor: EnquiryActor,
    range: { from: string; to: string },
  ): Promise<{ items: DemoView[] }> {
    if (
      !isCalendarDate(range.from) ||
      !isCalendarDate(range.to) ||
      range.to < range.from ||
      daysBetween(range.from, range.to) > MAX_DEMO_RANGE_DAYS
    )
      throw new DomainError(
        "DEMO_RANGE_INVALID",
        `Choose a range of at most ${String(MAX_DEMO_RANGE_DAYS)} days, ending on or after its start.`,
      );
    if (actor.role === "owner")
      return {
        items: await this.deps.reader.demosBetween(actor.workspaceId, range, {
          kind: "all",
        }),
      };
    const teacherId = await this.deps.reader.teacherIdForUser(
      actor.workspaceId,
      actor.userId,
    );
    if (teacherId == null) return { items: [] };
    const batchIds = await this.deps.reader.assignedBatchIds(
      actor.workspaceId,
      teacherId,
    );
    return {
      items: await this.deps.reader.demosBetween(actor.workspaceId, range, {
        kind: "teacher",
        teacherId,
        batchIds,
      }),
    };
  }

  /** A Batch's Classes on a date from its Batch Timings, for booking a demo. */
  async demoSlots(
    actor: EnquiryActor,
    input: { batchId: string; date: string },
  ): Promise<{ items: DemoSlotView[] }> {
    const schedule = this.deps.schedule;
    if (schedule == null) throw new Error("Demo slots need a schedule store.");
    const batch = await schedule.findScheduleBatch(
      actor.workspaceId,
      input.batchId,
    );
    if (batch == null) throw new BatchNotFoundError();
    const timings = batch.sources[0];
    if (timings == null) return { items: [] };
    const { changes, holidays } = await schedule.classExceptions(
      actor.workspaceId,
      batch.id,
    );
    const local = localNow(this.deps.now(), batch.timezone);
    return {
      items: classesOn(timings, input.date, changes, holidays).map(
        (scheduled) => ({
          date: scheduled.date,
          startTime: scheduled.startTime,
          endTime: scheduled.endTime,
          status: scheduled.status,
          rescheduled: scheduled.rescheduled,
          reason: scheduled.reason,
          bookable:
            !batch.closed &&
            scheduled.status === "scheduled" &&
            !hasStarted(scheduled, local),
        }),
      ),
    };
  }

  async sources(actor: EnquiryActor): Promise<{ items: EnquirySourceView[] }> {
    await this.deps.reader.ensureDefaultSources(
      actor.workspaceId,
      actor.userId,
    );
    return { items: await this.deps.reader.sources(actor.workspaceId) };
  }

  async options(actor: EnquiryActor): Promise<EnquiryOptionsView> {
    const [{ items: sources }, options, currentTeacherId] = await Promise.all([
      this.sources(actor),
      this.deps.reader.options(actor.workspaceId),
      actor.role === "teacher"
        ? this.deps.reader.teacherIdForUser(actor.workspaceId, actor.userId)
        : Promise.resolve(null),
    ]);
    return { ...options, sources, currentTeacherId };
  }

  /** Open Enquiries and active Students with the same phone number. */
  async phoneMatches(
    actor: EnquiryActor,
    input: { phone: string; excludeEnquiryId?: string | null },
  ): Promise<PhoneMatchesView> {
    const digits = phoneMatchKey(input.phone);
    if (digits.length === 0) return { enquiries: [], students: [] };
    return this.deps.reader.phoneMatches(
      actor.workspaceId,
      digits,
      input.excludeEnquiryId ?? null,
    );
  }

  async summary(
    actor: EnquiryActor,
    month: string,
  ): Promise<EnquirySummaryView> {
    if (actor.role !== "owner")
      throw new DomainError(
        "ENQUIRY_SUMMARY_FORBIDDEN",
        "Only the Owner can see the Enquiry summary.",
      );
    return this.deps.reader.summary(actor.workspaceId, enquiryMonth(month));
  }
}
