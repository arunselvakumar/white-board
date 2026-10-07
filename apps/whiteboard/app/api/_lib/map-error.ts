import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { jsonError } from "./json-error";

const NOT_FOUND_CODES = new Set([
  "COURSE_NOT_FOUND",
  "STUDENT_NOT_FOUND",
  "BATCH_NOT_FOUND",
  "ENROLLMENT_NOT_FOUND",
  "FEE_PAYMENT_NOT_FOUND",
  "TEACHER_NOT_FOUND",
  "TEACHER_ASSIGNMENT_NOT_FOUND",
  "TEACHER_DOCUMENT_NOT_FOUND",
  "ATTENDANCE_REGISTER_NOT_FOUND",
  "ATTENDANCE_MARK_NOT_FOUND",
  "CLASS_NOT_FOUND",
  "CLASS_FORBIDDEN",
  "HOLIDAY_NOT_FOUND",
  "ENQUIRY_NOT_FOUND",
  "DEMO_NOT_FOUND",
  "ENQUIRY_SOURCE_NOT_FOUND",
  "STUDY_MATERIAL_NOT_FOUND",
  "HOMEWORK_NOT_FOUND",
  "HOMEWORK_SUBMISSION_NOT_FOUND",
  "ATTACHMENT_NOT_FOUND",
]);
const CONFLICT_CODES = new Set([
  "COURSE_CODE_IN_USE",
  "COURSE_ALREADY_ARCHIVED",
  "STUDENT_ALREADY_DROPPED",
  "STUDENT_REQUEST_CONFLICT",
  "BATCH_ALREADY_CLOSED",
  "BATCH_CLOSED",
  "COURSE_ARCHIVED",
  "BATCH_AT_CAPACITY",
  "STUDENT_ALREADY_ENROLLED",
  "ENROLLMENT_ALREADY_ENDED",
  "STUDENT_DROPPED",
  "FEE_OVERPAY",
  "FEE_PLAN_BELOW_PAYMENTS",
  "TEACHER_EMAIL_IN_USE",
  "TEACHER_USER_IN_USE",
  "TEACHER_INACTIVE",
  "TEACHER_ALREADY_ACTIVE",
  "TEACHER_ALREADY_LINKED",
  "TEACHER_ALREADY_ASSIGNED",
  "TEACHER_DOCUMENT_LIMIT",
  "ATTENDANCE_NOT_SCHEDULED",
  "ATTENDANCE_ROSTER_EMPTY",
  "CLASS_NOT_HOSTED",
  "CLASS_NOT_IN_PROGRESS",
  "CLASS_STARTING",
  "CLASS_NOT_READY",
  "CLASS_ENDED",
  "CLASS_CANCELLED",
  "CLASS_ALREADY_CANCELLED",
  "CLASS_ALREADY_MOVED",
  "CLASS_ALREADY_STARTED",
  "CLASS_HAS_ATTENDANCE",
  "CLASS_ON_HOLIDAY",
  "CLASS_NOT_CHANGED",
  "CLASS_MOVE_TO_HOLIDAY",
  "CLASS_MOVE_TARGET_TAKEN",
  "CLASS_CHANGE_CONFLICT",
  "HOLIDAY_OVERLAPS",
  "HOLIDAY_CONFLICTS_WITH_HELD_CLASS",
  "HOLIDAY_STARTED",
  "ATTENDANCE_CLASS_CANCELLED",
  "BATCH_HAS_CLASS_CHANGES",
  "ENQUIRY_CLOSED",
  "ENQUIRY_JOINED",
  "ENQUIRY_NOT_CLOSED",
  "ENQUIRY_ALREADY_CONVERTED",
  "ENQUIRY_SOURCE_RETIRED",
  "ENQUIRY_SOURCE_NAME_IN_USE",
  "ENQUIRY_SOURCE_ALREADY_RETIRED",
  "ENQUIRY_SOURCE_NOT_RETIRED",
  "DEMO_CLASS_UNAVAILABLE",
  "DEMO_IN_PAST",
  "DEMO_ON_HOLIDAY",
  "DEMO_TEACHER_CLASH",
  "DEMO_NOT_STARTED",
  "DEMO_CANCELLED",
  "DEMO_ALREADY_CANCELLED",
  "DEMO_ATTENDANCE_MARKED",
  "DEMO_FREE",
  "DEMO_FEE_ALREADY_PAID",
  "STUDY_MATERIAL_REMOVED",
  "HOMEWORK_REMOVED",
  "HOMEWORK_ACCESS_ENDED",
  "HOMEWORK_SUBMISSION_CHECKED",
  "HOMEWORK_NOT_SUBMITTED",
  "ATTACHMENT_UPLOAD_LIMIT",
]);
const ENQUIRY_FORBIDDEN_CODES = new Set([
  "ENQUIRY_CONVERT_FORBIDDEN",
  "ENQUIRY_SUMMARY_FORBIDDEN",
]);

function errorCode(error: unknown): string | undefined {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}

export function mapError(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return jsonError(
      StatusCodes.BAD_REQUEST,
      "VALIDATION_ERROR",
      "Invalid JSON body.",
    );
  }
  if (error instanceof z.ZodError) {
    return jsonError(
      StatusCodes.BAD_REQUEST,
      "VALIDATION_ERROR",
      "Invalid request.",
      z.treeifyError(error),
    );
  }
  const code = errorCode(error);
  if (code === "INVALID_CURSOR" && error instanceof Error) {
    return jsonError(StatusCodes.BAD_REQUEST, code, error.message);
  }
  if (
    (code === "ATTENDANCE_FORBIDDEN" ||
      code === "HOLIDAY_FORBIDDEN" ||
      code === "CLASS_WORK_FORBIDDEN") &&
    error instanceof Error
  ) {
    return jsonError(StatusCodes.FORBIDDEN, code, error.message);
  }
  if (
    code != null &&
    ENQUIRY_FORBIDDEN_CODES.has(code) &&
    error instanceof Error
  ) {
    return jsonError(StatusCodes.FORBIDDEN, code, error.message);
  }
  if (
    (code === "CLASS_NOT_CONFIGURED" ||
      code === "CLASS_PROVIDER_UNAVAILABLE") &&
    error instanceof Error
  ) {
    return jsonError(StatusCodes.SERVICE_UNAVAILABLE, code, error.message);
  }
  if (code != null && NOT_FOUND_CODES.has(code) && error instanceof Error) {
    return jsonError(StatusCodes.NOT_FOUND, code, error.message);
  }
  if (error instanceof Error && error.name === "DomainError" && code != null) {
    if (CONFLICT_CODES.has(code)) {
      return jsonError(StatusCodes.CONFLICT, code, error.message);
    }
    return jsonError(StatusCodes.BAD_REQUEST, code, error.message);
  }
  console.error(error);
  return jsonError(
    StatusCodes.INTERNAL_SERVER_ERROR,
    "INTERNAL_ERROR",
    "Something went wrong.",
  );
}

export function parseOrThrow<T>(
  result: { success: true; data: T } | { success: false; error: z.ZodError },
): T {
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
