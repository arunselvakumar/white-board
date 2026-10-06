import type { Batch } from "../domain/batch";
import type { ClassChangeFact, HolidayFact } from "../domain/class-schedule";
import type { Course } from "../domain/course";
import type { Demo } from "../domain/demo";
import type { Enquiry } from "../domain/enquiry";
import type { EnquirySource } from "../domain/enquiry-source";
import type { Enrollment } from "../domain/enrollment";
import type { ListCursor } from "../domain/list";
import type { Student } from "../domain/student";
import type { ChangeableBatch } from "./class-change-handlers";
import type {
  DemoView,
  EnquiryActivityView,
  EnquiryListFilter,
  EnquiryOptionsView,
  EnquiryRecord,
  EnquirySourceView,
  EnquirySummaryView,
  PhoneMatchesView,
} from "./enquiry-views";

/** Write side for Enquiries, demos, and Enquiry Sources. */
export type EnquiryStore = {
  /** Runs `work` in one transaction; every lock below lasts until it ends. */
  transaction<T>(work: (store: EnquiryStore) => Promise<T>): Promise<T>;
  /**
   * Loads the Enquiry with its demos' stage facts, locking its row so stage
   * changes from concurrent commands can't interleave.
   */
  lockEnquiry(workspaceId: string, id: string): Promise<Enquiry | null>;
  /** Inserts or updates the Enquiry and appends its pending history. */
  saveEnquiry(enquiry: Enquiry): Promise<void>;
  demosOf(workspaceId: string, enquiryId: string): Promise<Demo[]>;
  findDemo(workspaceId: string, id: string): Promise<Demo | null>;
  saveDemo(demo: Demo): Promise<void>;
  findSource(workspaceId: string, id: string): Promise<EnquirySource | null>;
  /** Maps the active-name unique index to ENQUIRY_SOURCE_NAME_IN_USE. */
  saveSource(source: EnquirySource): Promise<void>;
  activeSourceNameTaken(
    workspaceId: string,
    name: string,
    exceptId: string | null,
  ): Promise<boolean>;
  findCourse(
    workspaceId: string,
    id: string,
  ): Promise<{ archived: boolean } | null>;
  /** The Batch's schedule lock, shared with Class Changes (ADR-0028). */
  lockBatchSchedule(workspaceId: string, batchId: string): Promise<void>;
  /** Locks the Teacher row so one-to-one bookings for them run one at a time. */
  lockTeacher(
    workspaceId: string,
    teacherId: string,
  ): Promise<{ active: boolean } | null>;
  findScheduleBatch(
    workspaceId: string,
    batchId: string,
  ): Promise<ChangeableBatch | null>;
  classExceptions(
    workspaceId: string,
    batchId: string,
  ): Promise<{ changes: ClassChangeFact[]; holidays: HolidayFact[] }>;
  holidays(workspaceId: string): Promise<HolidayFact[]>;
  teacherOneToOneDemos(
    workspaceId: string,
    teacherId: string,
    date: string,
  ): Promise<Demo[]>;
  findEnrollmentBatch(
    workspaceId: string,
    batchId: string,
  ): Promise<Batch | null>;
  findEnrollmentCourse(
    workspaceId: string,
    courseId: string,
  ): Promise<Course | null>;
  /**
   * Locks the Batch row, checks capacity like Enroll Student, then inserts the
   * Student and the Enrollment.
   */
  admit(
    student: Student,
    enrollment: Enrollment,
    capacity: number,
  ): Promise<void>;
};

export type EnquiryListParams = {
  workspaceId: string;
  view: EnquiryListFilter;
  q: string | null;
  limit: number;
  after?: ListCursor<string>;
  before?: ListCursor<string>;
  today: string;
};

export type DemoScope =
  { kind: "all" } | { kind: "teacher"; teacherId: string; batchIds: string[] };

/** Read side for Enquiries and demos. */
export type EnquiryReader = {
  list(params: EnquiryListParams): Promise<{
    items: (EnquiryRecord & { createdAtDate: Date })[];
    total: number;
    hasMore: boolean;
  }>;
  get(workspaceId: string, id: string): Promise<EnquiryRecord | null>;
  /** Newest first. */
  history(
    workspaceId: string,
    enquiryId: string,
  ): Promise<EnquiryActivityView[]>;
  /** Ordered by date, then start time. Includes cancelled demos. */
  demosOf(workspaceId: string, enquiryId: string): Promise<DemoView[]>;
  demo(workspaceId: string, id: string): Promise<DemoView | null>;
  /** Non-cancelled demos between two dates, by date and start time. */
  demosBetween(
    workspaceId: string,
    range: { from: string; to: string },
    scope: DemoScope,
  ): Promise<DemoView[]>;
  /** The caller's active Teacher record, if any. */
  teacherIdForUser(workspaceId: string, userId: string): Promise<string | null>;
  assignedBatchIds(workspaceId: string, teacherId: string): Promise<string[]>;
  /** Adds the default Sources when the Workspace has none (idempotent). */
  ensureDefaultSources(workspaceId: string, userId: string): Promise<void>;
  /** Active first, then by name. */
  sources(workspaceId: string): Promise<EnquirySourceView[]>;
  source(workspaceId: string, id: string): Promise<EnquirySourceView | null>;
  options(
    workspaceId: string,
  ): Promise<Omit<EnquiryOptionsView, "sources" | "currentTeacherId">>;
  phoneMatches(
    workspaceId: string,
    digits: string,
    excludeEnquiryId: string | null,
  ): Promise<PhoneMatchesView>;
  summary(
    workspaceId: string,
    month: {
      month: string;
      firstDay: string;
      lastDay: string;
      from: Date;
      to: Date;
    },
  ): Promise<EnquirySummaryView>;
};
