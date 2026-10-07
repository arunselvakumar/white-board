import { ClassMode } from "../domain/class-mode";
import {
  classesOn,
  localNow,
  type ClassChangeFact,
  type HolidayFact,
  type ScheduledClass,
  type ScheduleSource,
} from "../domain/class-schedule";
import { Demo, demoFee, type DemoFeeKind } from "../domain/demo";
import {
  Enquiry,
  ENQUIRY_TIMEZONE,
  enquiryDetails,
  type EnquiryAction,
  type EnquiryDetails,
  type RawEnquiryDetails,
} from "../domain/enquiry";
import {
  EnquirySource,
  enquirySourceName,
  enquirySourceNameInUse,
} from "../domain/enquiry-source";
import { Enrollment } from "../domain/enrollment";
import { EnrollmentId } from "../domain/enrollment-id";
import { DomainError } from "../domain/errors";
import { FeePlan } from "../domain/fee-plan";
import { Student, StudentProfile } from "../domain/student";
import { StudentId } from "../domain/student-id";
import { TimingSource } from "../domain/timing-source";
import { UserId } from "../domain/user-id";
import { WeeklyTimings } from "../domain/weekly-timings";
import { WorkspaceId } from "../domain/workspace-id";
import type { EventDispatcher } from "./event-dispatcher";
import type { EnquiryReader, EnquiryStore } from "./enquiry-ports";
import { EnquiryQueries } from "./enquiry-queries";
import type {
  ConvertEnquiryView,
  DemoView,
  EnquiryActor,
  EnquiryDetailView,
  EnquirySourceView,
  EnquiryView,
} from "./enquiry-views";
import {
  BatchNotFoundError,
  CourseNotFoundError,
  TeacherNotFoundError,
} from "./not-found-error";

export function enquiryNotFound(): DomainError {
  return new DomainError("ENQUIRY_NOT_FOUND", "Enquiry not found.");
}

export function demoNotFound(): DomainError {
  return new DomainError("DEMO_NOT_FOUND", "Demo not found.");
}

export function enquirySourceNotFound(): DomainError {
  return new DomainError("ENQUIRY_SOURCE_NOT_FOUND", "Source not found.");
}

export type BookDemoInput =
  | {
      kind: "batch";
      batchId: string;
      date: string;
      startTime: string;
      feeKind: DemoFeeKind;
      feeAmountPaise?: number | null;
    }
  | {
      kind: "one_to_one";
      teacherId: string;
      date: string;
      startTime: string;
      endTime: string;
      feeKind: DemoFeeKind;
      feeAmountPaise?: number | null;
    };

export type ConvertEnquiryInput = {
  batchId: string;
  timingSource: string;
  studentTimings?: unknown;
  classModeOverride?: string | null;
};

/**
 * The Class a Batch demo joins: scheduled at this date and start time from
 * the Batch Timings, with Class Changes and Holidays applied. A Rescheduled
 * slot counts; a Cancelled, Moved-away, or Holiday Class doesn't.
 */
export function demoClassAt(
  source: ScheduleSource,
  key: { date: string; startTime: string },
  changes: readonly ClassChangeFact[],
  holidays: readonly HolidayFact[],
): ScheduledClass | null {
  return (
    classesOn(source, key.date, changes, holidays).find(
      (scheduled) =>
        scheduled.startTime === key.startTime &&
        scheduled.status === "scheduled",
    ) ?? null
  );
}

/** Commands for Enquiries, demos, and Enquiry Sources (ADR-0032). */
export class EnquiryHandlers {
  private readonly queries: EnquiryQueries;

  constructor(
    private readonly deps: {
      store: EnquiryStore;
      reader: EnquiryReader;
      events: EventDispatcher;
      now: () => Date;
      newId?: () => string;
    },
  ) {
    this.queries = new EnquiryQueries({
      reader: deps.reader,
      now: deps.now,
      schedule: deps.store,
    });
  }

  private id(): string {
    return (this.deps.newId ?? (() => crypto.randomUUID()))();
  }

  private action(actor: EnquiryActor): EnquiryAction {
    const now = this.deps.now();
    return {
      userId: actor.userId,
      now,
      today: localNow(now, ENQUIRY_TIMEZONE).date,
      activityId: this.id(),
    };
  }

  async create(
    actor: EnquiryActor,
    input: RawEnquiryDetails & { nextFollowUpOn?: string | null },
  ): Promise<EnquiryView> {
    const details = enquiryDetails(input);
    const id = this.id();
    await this.deps.store.transaction(async (store) => {
      await this.assertReferences(store, actor, details, null);
      const enquiry = Enquiry.record({
        id,
        workspaceId: actor.workspaceId,
        details,
        nextFollowUpOn: input.nextFollowUpOn,
        action: this.action(actor),
      });
      await store.saveEnquiry(enquiry);
    });
    return this.queries.enquiry(actor, id);
  }

  async updateDetails(
    actor: EnquiryActor,
    id: string,
    input: RawEnquiryDetails,
  ): Promise<EnquiryView> {
    const details = enquiryDetails(input);
    await this.withEnquiry(actor, id, async (store, enquiry) => {
      const previous = enquiry.details;
      enquiry.updateDetails(details, this.action(actor));
      await this.assertReferences(store, actor, details, previous);
      await store.saveEnquiry(enquiry);
    });
    return this.queries.enquiry(actor, id);
  }

  async logFollowUp(
    actor: EnquiryActor,
    id: string,
    input: { note: string; nextFollowUpOn: string | null },
  ): Promise<EnquiryDetailView> {
    await this.withEnquiry(actor, id, async (store, enquiry) => {
      enquiry.logFollowUp(input, this.action(actor));
      await store.saveEnquiry(enquiry);
    });
    return this.queries.detail(actor, id);
  }

  /** Closes the Enquiry and calls off its demos that aren't marked yet. */
  async markNotInterested(
    actor: EnquiryActor,
    id: string,
    reason: string,
  ): Promise<EnquiryView> {
    await this.withEnquiry(actor, id, async (store, enquiry) => {
      const action = this.action(actor);
      enquiry.markNotInterested(reason, action);
      const demos = await store.demosOf(actor.workspaceId, id);
      for (const demo of demos.filter((candidate) => candidate.pending)) {
        demo.cancel({ userId: actor.userId, now: action.now });
        await store.saveDemo(demo);
      }
      enquiry.demosChanged(
        demos.map((demo) => demo.toStageFact()),
        action.now,
      );
      await store.saveEnquiry(enquiry);
    });
    return this.queries.enquiry(actor, id);
  }

  async reopen(
    actor: EnquiryActor,
    id: string,
    input: { nextFollowUpOn?: string | null },
  ): Promise<EnquiryView> {
    await this.withEnquiry(actor, id, async (store, enquiry) => {
      enquiry.reopen(input, this.action(actor));
      await store.saveEnquiry(enquiry);
    });
    return this.queries.enquiry(actor, id);
  }

  /**
   * Owner only. Creates the Student and Enrollment and marks the Enquiry
   * Joined in one transaction; if any rule fails, nothing is written.
   */
  async convert(
    actor: EnquiryActor,
    id: string,
    input: ConvertEnquiryInput,
  ): Promise<ConvertEnquiryView> {
    if (actor.role !== "owner")
      throw new DomainError(
        "ENQUIRY_CONVERT_FORBIDDEN",
        "Only the Owner can convert an Enquiry.",
      );
    const workspaceId = WorkspaceId.create(actor.workspaceId);
    const { studentId, enrollmentId, events } = await this.withEnquiry(
      actor,
      id,
      async (store, enquiry) => {
        enquiry.assertCanConvert();
        const batch = await store.findEnrollmentBatch(
          actor.workspaceId,
          input.batchId,
        );
        if (batch == null) throw new BatchNotFoundError();
        batch.assertOpenForEnrollment();
        const course = await store.findEnrollmentCourse(
          actor.workspaceId,
          batch.courseId.value,
        );
        if (course == null) throw new CourseNotFoundError();
        course.assertAcceptsNewEnrollments();
        const action = this.action(actor);
        const details = enquiry.details;
        const student = Student.create({
          id: StudentId.create(this.id()),
          workspaceId,
          createdByUserId: UserId.create(actor.userId),
          profile: StudentProfile.fromRaw({
            name: details.prospectName,
            phone: details.phone,
            email: details.email,
            guardianName: details.guardianName,
            guardianPhone: details.guardianPhone,
          }),
          now: action.now,
        });
        const timingSource = TimingSource.create(input.timingSource);
        const enrollment = Enrollment.create({
          id: EnrollmentId.create(this.id()),
          workspaceId,
          studentId: student.id,
          courseId: course.id,
          batchId: batch.id,
          createdByUserId: UserId.create(actor.userId),
          classModeOverride:
            input.classModeOverride == null || input.classModeOverride === ""
              ? null
              : ClassMode.create(input.classModeOverride),
          timingSource,
          studentTimings: timingSource.inheritsBatch
            ? null
            : WeeklyTimings.create(input.studentTimings),
          feePlan: FeePlan.fromCourseDefault(
            course.defaultFeeAmount,
            action.now,
          ),
          now: action.now,
        });
        await store.admit(student, enrollment, batch.capacity.value);
        enquiry.markJoined(
          { studentId: student.id.value, enrollmentId: enrollment.id.value },
          action,
        );
        await store.saveEnquiry(enquiry);
        return {
          studentId: student.id.value,
          enrollmentId: enrollment.id.value,
          events: [
            ...student.pullDomainEvents(),
            ...enrollment.pullDomainEvents(),
          ],
        };
      },
    );
    // After commit, so the Student exists when the invitation listener runs.
    await this.deps.events.dispatch(events);
    return {
      enquiry: await this.queries.enquiry(actor, id),
      studentId,
      enrollmentId,
    };
  }

  async bookDemo(
    actor: EnquiryActor,
    enquiryId: string,
    input: BookDemoInput,
  ): Promise<DemoView> {
    const demoId = this.id();
    await this.withEnquiry(actor, enquiryId, async (store, enquiry) => {
      enquiry.assertCanBookDemo();
      const fee = demoFee(input.feeKind, input.feeAmountPaise);
      const now = this.deps.now();
      const booking = {
        id: demoId,
        workspaceId: actor.workspaceId,
        enquiryId,
        fee,
        userId: actor.userId,
        now,
      };
      let demo: Demo;
      if (input.kind === "batch") {
        await store.lockBatchSchedule(actor.workspaceId, input.batchId);
        const batch = await store.findScheduleBatch(
          actor.workspaceId,
          input.batchId,
        );
        if (batch == null) throw new BatchNotFoundError();
        if (batch.closed)
          throw new DomainError(
            "BATCH_CLOSED",
            "A closed Batch can't take demos.",
          );
        const { changes, holidays } = await store.classExceptions(
          actor.workspaceId,
          batch.id,
        );
        // Batch Timings only: Student-specific Timings are private Classes.
        const timings = batch.sources[0];
        const found =
          timings == null
            ? null
            : demoClassAt(timings, input, changes, holidays);
        if (found == null)
          throw new DomainError(
            "DEMO_CLASS_UNAVAILABLE",
            "This Batch has no scheduled Class at that date and start time.",
          );
        demo = Demo.bookBatch({
          ...booking,
          batchId: batch.id,
          timezone: batch.timezone,
          localNow: localNow(now, batch.timezone),
          slot: {
            date: found.date,
            startTime: found.startTime,
            endTime: found.endTime,
          },
        });
      } else {
        const teacher = await store.lockTeacher(
          actor.workspaceId,
          input.teacherId,
        );
        if (teacher == null) throw new TeacherNotFoundError();
        if (!teacher.active)
          throw new DomainError(
            "TEACHER_INACTIVE",
            "This Teacher is deactivated.",
          );
        const [holidays, teacherDemos] = await Promise.all([
          store.holidays(actor.workspaceId),
          store.teacherOneToOneDemos(
            actor.workspaceId,
            input.teacherId,
            input.date,
          ),
        ]);
        demo = Demo.bookOneToOne({
          ...booking,
          teacherId: input.teacherId,
          timezone: ENQUIRY_TIMEZONE,
          localNow: localNow(now, ENQUIRY_TIMEZONE),
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          holidays,
          teacherDemos,
        });
      }
      await store.saveDemo(demo);
      await this.restage(store, actor, enquiry, now);
    });
    return this.queries.demo(actor, demoId);
  }

  async markDemoAttendance(
    actor: EnquiryActor,
    demoId: string,
    attended: boolean,
  ): Promise<DemoView> {
    return this.withDemo(actor, demoId, (demo, now) => {
      demo.markAttendance(attended, {
        userId: actor.userId,
        now,
        localNow: localNow(now, demo.timezone),
      });
    });
  }

  async markDemoFeePaid(
    actor: EnquiryActor,
    demoId: string,
  ): Promise<DemoView> {
    return this.withDemo(actor, demoId, (demo, now) => {
      demo.markFeePaid({ userId: actor.userId, now });
    });
  }

  async cancelDemo(actor: EnquiryActor, demoId: string): Promise<DemoView> {
    return this.withDemo(actor, demoId, (demo, now) => {
      demo.cancel({ userId: actor.userId, now });
    });
  }

  async addSource(
    actor: EnquiryActor,
    input: { name: string },
  ): Promise<EnquirySourceView> {
    const source = EnquirySource.add({
      id: this.id(),
      workspaceId: actor.workspaceId,
      name: input.name,
      userId: actor.userId,
      now: this.deps.now(),
    });
    await this.deps.reader.ensureDefaultSources(
      actor.workspaceId,
      actor.userId,
    );
    await this.deps.store.transaction(async (store) => {
      await this.assertNameFree(store, actor, source.name, null);
      await store.saveSource(source);
    });
    return this.sourceView(actor, source.id);
  }

  async renameSource(
    actor: EnquiryActor,
    id: string,
    input: { name: string },
  ): Promise<EnquirySourceView> {
    const name = enquirySourceName(input.name);
    await this.withSource(actor, id, async (store, source) => {
      if (!source.retired) await this.assertNameFree(store, actor, name, id);
      source.rename(name, this.deps.now());
    });
    return this.sourceView(actor, id);
  }

  async retireSource(
    actor: EnquiryActor,
    id: string,
  ): Promise<EnquirySourceView> {
    await this.withSource(actor, id, (_store, source) => {
      source.retire({ userId: actor.userId, now: this.deps.now() });
      return Promise.resolve();
    });
    return this.sourceView(actor, id);
  }

  async restoreSource(
    actor: EnquiryActor,
    id: string,
  ): Promise<EnquirySourceView> {
    await this.withSource(actor, id, async (store, source) => {
      source.restore(this.deps.now());
      await this.assertNameFree(store, actor, source.name, id);
    });
    return this.sourceView(actor, id);
  }

  private async withEnquiry<T>(
    actor: EnquiryActor,
    id: string,
    work: (store: EnquiryStore, enquiry: Enquiry) => Promise<T>,
  ): Promise<T> {
    return this.deps.store.transaction(async (store) => {
      const enquiry = await store.lockEnquiry(actor.workspaceId, id);
      if (enquiry == null) throw enquiryNotFound();
      return work(store, enquiry);
    });
  }

  private async withDemo(
    actor: EnquiryActor,
    demoId: string,
    change: (demo: Demo, now: Date) => void,
  ): Promise<DemoView> {
    await this.deps.store.transaction(async (store) => {
      const found = await store.findDemo(actor.workspaceId, demoId);
      if (found == null) throw demoNotFound();
      // Lock the Enquiry first, then re-read the demo under that lock.
      const enquiry = await store.lockEnquiry(
        actor.workspaceId,
        found.enquiryId,
      );
      if (enquiry == null) throw demoNotFound();
      const demo = await store.findDemo(actor.workspaceId, demoId);
      if (demo == null) throw demoNotFound();
      const now = this.deps.now();
      change(demo, now);
      await store.saveDemo(demo);
      await this.restage(store, actor, enquiry, now);
    });
    return this.queries.demo(actor, demoId);
  }

  private async restage(
    store: EnquiryStore,
    actor: EnquiryActor,
    enquiry: Enquiry,
    now: Date,
  ): Promise<void> {
    const demos = await store.demosOf(actor.workspaceId, enquiry.id);
    enquiry.demosChanged(
      demos.map((demo) => demo.toStageFact()),
      now,
    );
    await store.saveEnquiry(enquiry);
  }

  /**
   * The Course and Source must be in the Workspace. A new choice must be
   * active; an edit may keep the Enquiry's current retired Source or
   * archived Course unchanged.
   */
  private async assertReferences(
    store: EnquiryStore,
    actor: EnquiryActor,
    details: EnquiryDetails,
    previous: EnquiryDetails | null,
  ): Promise<void> {
    if (details.courseId != null) {
      const course = await store.findCourse(
        actor.workspaceId,
        details.courseId,
      );
      if (course == null) throw new CourseNotFoundError();
      if (course.archived && previous?.courseId !== details.courseId)
        throw new DomainError(
          "COURSE_ARCHIVED",
          "This Course is archived. Choose another Course.",
        );
    }
    if (details.sourceId != null) {
      const source = await store.findSource(
        actor.workspaceId,
        details.sourceId,
      );
      if (source == null) throw enquirySourceNotFound();
      if (previous?.sourceId !== details.sourceId) source.assertSelectable();
    }
  }

  private async withSource(
    actor: EnquiryActor,
    id: string,
    change: (store: EnquiryStore, source: EnquirySource) => Promise<void>,
  ): Promise<void> {
    await this.deps.store.transaction(async (store) => {
      const source = await store.findSource(actor.workspaceId, id);
      if (source == null) throw enquirySourceNotFound();
      await change(store, source);
      await store.saveSource(source);
    });
  }

  private async assertNameFree(
    store: EnquiryStore,
    actor: EnquiryActor,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    if (await store.activeSourceNameTaken(actor.workspaceId, name, exceptId))
      throw enquirySourceNameInUse();
  }

  private async sourceView(
    actor: EnquiryActor,
    id: string,
  ): Promise<EnquirySourceView> {
    const view = await this.deps.reader.source(actor.workspaceId, id);
    if (view == null) throw enquirySourceNotFound();
    return view;
  }
}
