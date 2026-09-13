export type CourseCreated = {
  type: "CourseCreated";
  courseId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type CourseUpdated = {
  type: "CourseUpdated";
  courseId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type CourseArchived = {
  type: "CourseArchived";
  courseId: string;
  workspaceId: string;
  archivedByUserId: string;
  occurredAt: Date;
};

export type BatchCreated = {
  type: "BatchCreated";
  batchId: string;
  courseId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type BatchScheduleUpdated = {
  type: "BatchScheduleUpdated";
  batchId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type BatchClosed = {
  type: "BatchClosed";
  batchId: string;
  workspaceId: string;
  closedByUserId: string;
  occurredAt: Date;
};

export type StudentCreated = {
  type: "StudentCreated";
  studentId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type StudentProfileUpdated = {
  type: "StudentProfileUpdated";
  studentId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type StudentDropped = {
  type: "StudentDropped";
  studentId: string;
  workspaceId: string;
  droppedByUserId: string;
  occurredAt: Date;
};

export type StudentEnrolled = {
  type: "StudentEnrolled";
  enrollmentId: string;
  studentId: string;
  batchId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type EnrollmentModeOverridden = {
  type: "EnrollmentModeOverridden";
  enrollmentId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type EnrollmentTimingsSet = {
  type: "EnrollmentTimingsSet";
  enrollmentId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type EnrollmentMoved = {
  type: "EnrollmentMoved";
  enrollmentId: string;
  batchId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type EnrollmentEnded = {
  type: "EnrollmentEnded";
  enrollmentId: string;
  workspaceId: string;
  endedByUserId: string;
  occurredAt: Date;
};

export type FeePlanAdjusted = {
  type: "FeePlanAdjusted";
  enrollmentId: string;
  workspaceId: string;
  occurredAt: Date;
};

export type FeePaymentRecorded = {
  type: "FeePaymentRecorded";
  feePaymentId: string;
  enrollmentId: string;
  receiptNumber: string;
  workspaceId: string;
  occurredAt: Date;
};

export type DomainEvent =
  | CourseCreated
  | CourseUpdated
  | CourseArchived
  | BatchCreated
  | BatchScheduleUpdated
  | BatchClosed
  | StudentCreated
  | StudentProfileUpdated
  | StudentDropped
  | StudentEnrolled
  | EnrollmentModeOverridden
  | EnrollmentTimingsSet
  | EnrollmentMoved
  | EnrollmentEnded
  | FeePlanAdjusted
  | FeePaymentRecorded;
