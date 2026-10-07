import type { ClassModeValue } from "../domain/class-mode";
import type {
  DemoAttendanceValue,
  EnquiryActivityKind,
  EnquiryStage,
} from "../domain/enquiry";
import type { DemoFeeKind, DemoKind } from "../domain/demo";

// JSON-ready read models for Enquiries and demos. Dates are ISO strings;
// calendar dates are YYYY-MM-DD.

export type EnquiryActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "teacher";
};

export type EnquirySourceView = {
  id: string;
  name: string;
  retired: boolean;
};

export type EnquiryView = {
  id: string;
  prospectName: string;
  phone: string;
  email: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  courseId: string | null;
  courseName: string | null;
  subject: string | null;
  preferredClassMode: ClassModeValue | null;
  preferredTiming: string | null;
  source: EnquirySourceView | null;
  notes: string | null;
  stage: EnquiryStage;
  nextFollowUpOn: string | null;
  followUpDue: boolean;
  notInterestedReason: string | null;
  convertedStudentId: string | null;
  convertedEnrollmentId: string | null;
  convertedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

/** An Enquiry as stored; `followUpDue` depends on today and is added later. */
export type EnquiryRecord = Omit<EnquiryView, "followUpDue">;

export type EnquiryActivityView = {
  id: string;
  kind: EnquiryActivityKind;
  note: string | null;
  nextFollowUpOn: string | null;
  createdByUserId: string;
  createdAt: string;
};

export type DemoView = {
  id: string;
  enquiryId: string;
  prospectName: string;
  enquiryInterest: string | null;
  kind: DemoKind;
  batchId: string | null;
  batchName: string | null;
  courseName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  feeKind: DemoFeeKind;
  feeAmountPaise: number | null;
  feePaidAt: string | null;
  attendance: DemoAttendanceValue;
  attendanceMarkedAt: string | null;
  cancelledAt: string | null;
  createdByUserId: string;
  createdAt: string;
};

export type EnquiryDetailView = EnquiryView & {
  history: EnquiryActivityView[];
  demos: DemoView[];
};

export type EnquiryListView = {
  items: EnquiryView[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export type EnquiryListFilter = "due" | "open" | "closed" | "all";

export type PhoneMatchesView = {
  enquiries: { id: string; prospectName: string; stage: EnquiryStage }[];
  students: { id: string; name: string }[];
};

export type EnquiryOptionsView = {
  courses: { id: string; name: string }[];
  batches: {
    id: string;
    name: string;
    courseId: string;
    courseName: string;
    classMode: ClassModeValue;
    timezone: string;
    capacity: number;
    enrolled: number;
  }[];
  teachers: { id: string; name: string }[];
  sources: EnquirySourceView[];
  currentTeacherId: string | null;
};

export type EnquirySummaryView = {
  month: string;
  enquiriesReceived: number;
  demosAttended: number;
  admissions: number;
  paidDemoFeesPaise: number;
  notInterestedReasons: { reason: string; count: number }[];
  sources: {
    sourceId: string | null;
    name: string;
    enquiries: number;
    admissions: number;
  }[];
};

export type DemoSlotView = {
  date: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "cancelled" | "moved" | "holiday";
  rescheduled: boolean;
  reason: string | null;
  bookable: boolean;
};

export type ConvertEnquiryView = {
  enquiry: EnquiryView;
  studentId: string;
  enrollmentId: string;
};
