import { assertEditableDay, canEditDay } from "../domain/attendance";
import {
  applyClassroomItems,
  dailyReportContent,
  EMPTY_DAILY_REPORT,
  type Meal,
} from "../domain/daily-report";
import { todayInIndia, type IsoDate } from "../domain/dates";
import type { PreschoolActor } from "./access";
import {
  assertOnRoster,
  openClassroom,
  placeChild,
  readableChild,
} from "./attendance-access";
import type {
  DailyReportNotifier,
  DailyReportStore,
} from "./daily-report-ports";
import type {
  ChildDailyReportsView,
  ClassroomDailyReportsView,
  DailyReportView,
  PublishDailyReportsView,
} from "./daily-report-views";

export type SaveDailyReportInput = Parameters<typeof dailyReportContent>[0] & {
  childId: string;
  date?: IsoDate;
};

export type ApplyToClassroomInput = {
  classroomId: string;
  date?: IsoDate;
  meals?: { meal: Meal; menu?: string | null }[];
  activities?: string[];
  /** Every Child marked present when left out; the whole roster when nobody is marked. */
  childIds?: string[];
};

export const DEFAULT_REPORT_PAGE = 14;

/** Daily Reports: written by the Classroom's staff, read by the Child's Parents once published. */
export class DailyReportHandlers {
  constructor(
    private readonly deps: {
      store: DailyReportStore;
      notifier: DailyReportNotifier;
      now: () => Date;
    },
  ) {}

  private today(): IsoDate {
    return todayInIndia(this.deps.now());
  }

  async day(
    actor: PreschoolActor,
    input: { classroomId: string; date?: IsoDate },
  ): Promise<ClassroomDailyReportsView> {
    const today = this.today();
    const date = input.date ?? today;
    const { store } = this.deps;
    const classroom = await openClassroom(store, actor, input.classroomId);
    const roster = await store.roster(classroom.id, date);
    const ids = roster.map((child) => child.childId);
    const [reports, attendance] = await Promise.all([
      store.reports(ids, date),
      store.attendance(ids, date),
    ]);
    const counts = { drafts: 0, published: 0, none: 0 };
    const children = roster.map((child) => {
      const report = reports.get(child.childId) ?? null;
      if (report == null) counts.none += 1;
      else if (report.status === "draft") counts.drafts += 1;
      else counts.published += 1;
      return {
        childId: child.childId,
        name: child.name,
        photoUrl: child.photoUrl,
        attendance: attendance.get(child.childId) ?? null,
        report,
      };
    });
    return {
      classroom,
      date,
      editable: canEditDay(actor.role, date, today),
      counts,
      children,
    };
  }

  /** Creates or replaces a Child's report; a published report stays published. */
  async save(
    actor: PreschoolActor,
    input: SaveDailyReportInput,
  ): Promise<DailyReportView> {
    const today = this.today();
    const date = input.date ?? today;
    assertEditableDay(actor.role, date, today);
    const content = dailyReportContent(input);
    const { child, classroom } = await placeChild(
      this.deps.store,
      actor,
      input.childId,
      date,
    );
    return this.deps.store.transaction(async (store) => {
      await store.lockReport(child.childId, date);
      await store.saveReport({
        workspaceId: actor.workspaceId,
        centreId: classroom.centreId,
        classroomId: classroom.id,
        childId: child.childId,
        date,
        content,
        userId: actor.userId,
      });
      const saved = await store.lockReport(child.childId, date);
      if (saved == null) throw new Error("The Daily Report was not saved.");
      return saved;
    });
  }

  /**
   * Lays the Classroom's menu and activities over each Child's report,
   * creating drafts where there are none.
   */
  async applyToClassroom(
    actor: PreschoolActor,
    input: ApplyToClassroomInput,
  ): Promise<ClassroomDailyReportsView> {
    const today = this.today();
    const date = input.date ?? today;
    assertEditableDay(actor.role, date, today);
    const classroom = await openClassroom(
      this.deps.store,
      actor,
      input.classroomId,
    );
    await this.deps.store.transaction(async (store) => {
      const roster = (await store.roster(classroom.id, date)).map(
        (child) => child.childId,
      );
      let childIds: readonly string[];
      if (input.childIds != null) {
        assertOnRoster(new Set(roster), input.childIds);
        childIds = input.childIds;
      } else {
        const attendance = await store.attendance(roster, date);
        childIds =
          attendance.size === 0
            ? roster
            : roster.filter((id) => attendance.get(id) === "present");
      }
      for (const childId of childIds) {
        const existing = await store.lockReport(childId, date);
        await store.saveReport({
          workspaceId: actor.workspaceId,
          centreId: classroom.centreId,
          classroomId: classroom.id,
          childId,
          date,
          content: applyClassroomItems(existing ?? EMPTY_DAILY_REPORT, input),
          userId: actor.userId,
        });
      }
    });
    return this.day(actor, { classroomId: classroom.id, date });
  }

  /**
   * Publishes the day's drafts of the Classroom (or of the given Children),
   * then tells each Child's Parents. A failed email never undoes it.
   */
  async publish(
    actor: PreschoolActor,
    input: { classroomId: string; date?: IsoDate; childIds?: string[] },
  ): Promise<PublishDailyReportsView> {
    const today = this.today();
    const date = input.date ?? today;
    assertEditableDay(actor.role, date, today);
    const classroom = await openClassroom(
      this.deps.store,
      actor,
      input.classroomId,
    );
    const publishedIds = await this.deps.store.transaction(async (store) => {
      if (input.childIds != null) {
        const roster = await store.roster(classroom.id, date);
        assertOnRoster(
          new Set(roster.map((child) => child.childId)),
          input.childIds,
        );
      }
      return store.publishDrafts({
        classroomId: classroom.id,
        date,
        childIds: input.childIds ?? null,
        userId: actor.userId,
        at: this.deps.now(),
      });
    });
    const families = await this.deps.store.families(publishedIds);
    await Promise.all(
      families.map(async (family) => {
        try {
          await this.deps.notifier.published({
            workspaceId: actor.workspaceId,
            ...family,
            date,
          });
        } catch (error) {
          console.error(
            "Daily Report email failed",
            { childId: family.childId, date },
            error,
          );
        }
      }),
    );
    return { published: publishedIds.length };
  }

  /** Newest first. Staff see drafts too; a Parent only published reports. */
  async childReports(
    actor: PreschoolActor,
    childId: string,
    input: { before?: IsoDate; limit?: number },
  ): Promise<ChildDailyReportsView> {
    const child = await readableChild(
      this.deps.store,
      actor,
      childId,
      this.today(),
    );
    const limit = input.limit ?? DEFAULT_REPORT_PAGE;
    const rows = await this.deps.store.childReports(childId, {
      before: input.before ?? null,
      limit,
      publishedOnly: actor.role === "parent",
    });
    const items = rows.slice(0, limit);
    return {
      childId,
      name: child.name,
      items,
      nextBefore: rows.length > limit ? (items.at(-1)?.date ?? null) : null,
    };
  }
}
