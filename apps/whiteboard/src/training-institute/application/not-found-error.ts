export class CourseNotFoundError extends Error {
  readonly code = "COURSE_NOT_FOUND";

  constructor() {
    super("Course not found.");
    this.name = "CourseNotFoundError";
  }
}

export class StudentNotFoundError extends Error {
  readonly code = "STUDENT_NOT_FOUND";

  constructor() {
    super("Student not found.");
    this.name = "StudentNotFoundError";
  }
}

export class BatchNotFoundError extends Error {
  readonly code = "BATCH_NOT_FOUND";

  constructor() {
    super("Batch not found.");
    this.name = "BatchNotFoundError";
  }
}

export class EnrollmentNotFoundError extends Error {
  readonly code = "ENROLLMENT_NOT_FOUND";

  constructor() {
    super("Enrollment not found.");
    this.name = "EnrollmentNotFoundError";
  }
}

export class FeePaymentNotFoundError extends Error {
  readonly code = "FEE_PAYMENT_NOT_FOUND";

  constructor() {
    super("Fee Payment not found.");
    this.name = "FeePaymentNotFoundError";
  }
}

export class TeacherNotFoundError extends Error {
  readonly code = "TEACHER_NOT_FOUND";

  constructor() {
    super("Teacher not found.");
    this.name = "TeacherNotFoundError";
  }
}

export class FeeFollowUpNotFoundError extends Error {
  readonly code = "FEE_FOLLOW_UP_NOT_FOUND";

  constructor() {
    super("Fee Follow-up not found.");
    this.name = "FeeFollowUpNotFoundError";
  }
}
