import { StatusCodes } from "http-status-codes";

import { CloseBatchRequestModel } from "../batches/close-batch-request-model";
import { CloseBatchResponseModel } from "../batches/close-batch-response-model";
import { CreateBatchRequestModel } from "../batches/create-batch-request-model";
import { CreateBatchResponseModel } from "../batches/create-batch-response-model";
import { GetBatchRequestModel } from "../batches/get-batch-request-model";
import { GetBatchResponseModel } from "../batches/get-batch-response-model";
import { ListBatchesRequestModel } from "../batches/list-batches-request-model";
import { ListBatchesResponseModel } from "../batches/list-batches-response-model";
import { UpdateBatchScheduleParamsModel } from "../batches/update-batch-schedule-params-model";
import { UpdateBatchScheduleRequestModel } from "../batches/update-batch-schedule-request-model";
import { UpdateBatchScheduleResponseModel } from "../batches/update-batch-schedule-response-model";
import { CreateStudentRequestModel } from "../students/create-student-request-model";
import { CreateStudentResponseModel } from "../students/create-student-response-model";
import { DropStudentRequestModel } from "../students/drop-student-request-model";
import { DropStudentResponseModel } from "../students/drop-student-response-model";
import { GetStudentRequestModel } from "../students/get-student-request-model";
import { GetStudentResponseModel } from "../students/get-student-response-model";
import { ListStudentsRequestModel } from "../students/list-students-request-model";
import { ListStudentsResponseModel } from "../students/list-students-response-model";
import { UpdateStudentProfileParamsModel } from "../students/update-student-profile-params-model";
import { UpdateStudentProfileRequestModel } from "../students/update-student-profile-request-model";
import { UpdateStudentProfileResponseModel } from "../students/update-student-profile-response-model";
import { ArchiveCourseRequestModel } from "../courses/archive-course-request-model";
import { ArchiveCourseResponseModel } from "../courses/archive-course-response-model";
import { CreateCourseRequestModel } from "../courses/create-course-request-model";
import { CreateCourseResponseModel } from "../courses/create-course-response-model";
import { GetCourseRequestModel } from "../courses/get-course-request-model";
import { GetCourseResponseModel } from "../courses/get-course-response-model";
import { ListCoursesRequestModel } from "../courses/list-courses-request-model";
import { ListCoursesResponseModel } from "../courses/list-courses-response-model";
import { UpdateCourseParamsModel } from "../courses/update-course-params-model";
import { UpdateCourseRequestModel } from "../courses/update-course-request-model";
import { UpdateCourseResponseModel } from "../courses/update-course-response-model";
import { AdjustFeePlanParamsModel } from "../enrollments/adjust-fee-plan-params-model";
import { AdjustFeePlanRequestModel } from "../enrollments/adjust-fee-plan-request-model";
import { AdjustFeePlanResponseModel } from "../enrollments/adjust-fee-plan-response-model";
import { CreateEnrollmentRequestModel } from "../enrollments/create-enrollment-request-model";
import { CreateEnrollmentResponseModel } from "../enrollments/create-enrollment-response-model";
import { ListEnrollmentsRequestModel } from "../enrollments/list-enrollments-request-model";
import { ListEnrollmentsResponseModel } from "../enrollments/list-enrollments-response-model";
import { EndEnrollmentRequestModel } from "../enrollments/end-enrollment-request-model";
import { EndEnrollmentResponseModel } from "../enrollments/end-enrollment-response-model";
import { GetEnrollmentRequestModel } from "../enrollments/get-enrollment-request-model";
import { GetEnrollmentResponseModel } from "../enrollments/get-enrollment-response-model";
import { ListFeePaymentsParamsModel } from "../enrollments/list-fee-payments-params-model";
import { ListFeePaymentsRequestModel } from "../enrollments/list-fee-payments-request-model";
import { ListFeePaymentsResponseModel } from "../enrollments/list-fee-payments-response-model";
import { MoveEnrollmentParamsModel } from "../enrollments/move-enrollment-params-model";
import { MoveEnrollmentRequestModel } from "../enrollments/move-enrollment-request-model";
import { MoveEnrollmentResponseModel } from "../enrollments/move-enrollment-response-model";
import { OverrideEnrollmentModeParamsModel } from "../enrollments/override-enrollment-mode-params-model";
import { OverrideEnrollmentModeRequestModel } from "../enrollments/override-enrollment-mode-request-model";
import { OverrideEnrollmentModeResponseModel } from "../enrollments/override-enrollment-mode-response-model";
import { RecordFeePaymentParamsModel } from "../enrollments/record-fee-payment-params-model";
import { RecordFeePaymentRequestModel } from "../enrollments/record-fee-payment-request-model";
import { RecordFeePaymentResponseModel } from "../enrollments/record-fee-payment-response-model";
import { SetEnrollmentTimingsParamsModel } from "../enrollments/set-enrollment-timings-params-model";
import { SetEnrollmentTimingsRequestModel } from "../enrollments/set-enrollment-timings-request-model";
import { SetEnrollmentTimingsResponseModel } from "../enrollments/set-enrollment-timings-response-model";
import { GetOwnerDashboardResponseModel } from "../dashboard/get-owner-dashboard-response-model";
import { GetReceiptRequestModel } from "../payments/get-receipt-request-model";
import { GetReceiptResponseModel } from "../payments/get-receipt-response-model";
import { buildOpenApiDocument } from "./openapi";

export const openApiDocument = buildOpenApiDocument([
  {
    method: "post",
    path: "/api/students",
    summary: "Admit a Student",
    tags: ["Students"],
    body: CreateStudentRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "Created",
    successSchema: CreateStudentResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/students",
    summary: "List Students in the Active Workspace",
    tags: ["Students"],
    query: ListStudentsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Listed",
    successSchema: ListStudentsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/students/{id}",
    summary: "Get a Student",
    tags: ["Students"],
    params: GetStudentRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Found",
    successSchema: GetStudentResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/students/{id}/profile",
    summary: "Update a Student profile",
    tags: ["Students"],
    params: UpdateStudentProfileParamsModel,
    body: UpdateStudentProfileRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Updated",
    successSchema: UpdateStudentProfileResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/students/{id}/drop",
    summary: "Drop a Student",
    tags: ["Students"],
    params: DropStudentRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Dropped",
    successSchema: DropStudentResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/courses",
    summary: "Create a Course",
    tags: ["Courses"],
    body: CreateCourseRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "Created",
    successSchema: CreateCourseResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/courses",
    summary: "List Courses in the Active Workspace",
    tags: ["Courses"],
    query: ListCoursesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Listed",
    successSchema: ListCoursesResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/courses/{id}",
    summary: "Get a Course",
    tags: ["Courses"],
    params: GetCourseRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Found",
    successSchema: GetCourseResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/courses/{id}/update",
    summary: "Update a Course",
    tags: ["Courses"],
    params: UpdateCourseParamsModel,
    body: UpdateCourseRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Updated",
    successSchema: UpdateCourseResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/courses/{id}/archive",
    summary: "Archive a Course",
    tags: ["Courses"],
    params: ArchiveCourseRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Archived",
    successSchema: ArchiveCourseResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/batches",
    summary: "Create a Batch",
    tags: ["Batches"],
    body: CreateBatchRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "Created",
    successSchema: CreateBatchResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/batches",
    summary: "List Batches in the Active Workspace",
    tags: ["Batches"],
    query: ListBatchesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Listed",
    successSchema: ListBatchesResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/batches/{id}",
    summary: "Get a Batch",
    tags: ["Batches"],
    params: GetBatchRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Found",
    successSchema: GetBatchResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/batches/{id}/schedule",
    summary: "Update a Batch schedule",
    tags: ["Batches"],
    params: UpdateBatchScheduleParamsModel,
    body: UpdateBatchScheduleRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Updated",
    successSchema: UpdateBatchScheduleResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/batches/{id}/close",
    summary: "Close a Batch",
    tags: ["Batches"],
    params: CloseBatchRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Closed",
    successSchema: CloseBatchResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/enrollments",
    summary: "Enroll a Student in a Batch",
    tags: ["Enrollments"],
    body: CreateEnrollmentRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "Created",
    successSchema: CreateEnrollmentResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/enrollments",
    summary: "List Enrollments in the Active Workspace",
    tags: ["Enrollments"],
    query: ListEnrollmentsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Listed",
    successSchema: ListEnrollmentsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/enrollments/{id}",
    summary: "Get an Enrollment",
    tags: ["Enrollments"],
    params: GetEnrollmentRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Found",
    successSchema: GetEnrollmentResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/enrollments/{id}/mode",
    summary: "Override Enrollment Class Mode",
    tags: ["Enrollments"],
    params: OverrideEnrollmentModeParamsModel,
    body: OverrideEnrollmentModeRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Updated",
    successSchema: OverrideEnrollmentModeResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/enrollments/{id}/timings",
    summary: "Set Enrollment Timings",
    tags: ["Enrollments"],
    params: SetEnrollmentTimingsParamsModel,
    body: SetEnrollmentTimingsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Updated",
    successSchema: SetEnrollmentTimingsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/enrollments/{id}/move",
    summary: "Move an Enrollment to another Batch",
    tags: ["Enrollments"],
    params: MoveEnrollmentParamsModel,
    body: MoveEnrollmentRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Moved",
    successSchema: MoveEnrollmentResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/enrollments/{id}/end",
    summary: "End an Enrollment",
    tags: ["Enrollments"],
    params: EndEnrollmentRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Ended",
    successSchema: EndEnrollmentResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/enrollments/{id}/fee-plan",
    summary: "Adjust the Fee Plan on an Enrollment",
    tags: ["Fees"],
    params: AdjustFeePlanParamsModel,
    body: AdjustFeePlanRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Updated",
    successSchema: AdjustFeePlanResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/enrollments/{id}/payments",
    summary: "Record a Fee Payment",
    tags: ["Fees"],
    params: RecordFeePaymentParamsModel,
    body: RecordFeePaymentRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "Recorded",
    successSchema: RecordFeePaymentResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/enrollments/{id}/payments",
    summary: "List Fee Payments for an Enrollment",
    tags: ["Fees"],
    params: ListFeePaymentsParamsModel,
    query: ListFeePaymentsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Listed",
    successSchema: ListFeePaymentsResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/payments/{id}/receipt",
    summary: "Get a Receipt",
    tags: ["Fees"],
    params: GetReceiptRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Found",
    successSchema: GetReceiptResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/dashboard",
    summary: "Get the Owner Dashboard",
    tags: ["Dashboard"],
    successStatus: StatusCodes.OK,
    successDescription: "Found",
    successSchema: GetOwnerDashboardResponseModel,
    errors: [
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
]);
