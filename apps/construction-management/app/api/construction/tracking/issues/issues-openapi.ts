import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  BulkConstructionTrackingIssuesRequestModel,
  BulkConstructionTrackingIssuesResponseModel,
  ConstructionTrackingIssueActionsResponseModel,
  ConstructionTrackingIssueDetailResponseModel,
  ConstructionTrackingIssueHistoryItemResponseModel,
  ConstructionTrackingIssueParamsModel,
  ConstructionTrackingIssueProgressParamsModel,
  ConstructionTrackingIssueProgressResponseModel,
  ConstructionTrackingIssueResponseModel,
  CreateConstructionTrackingIssueRequestModel,
  DeleteConstructionTrackingIssueRequestModel,
  GetConstructionTrackingIssueFormOptionsRequestModel,
  GetConstructionTrackingIssueFormOptionsResponseModel,
  ISSUES_PATH,
  ListConstructionTrackingIssueProgressResponseModel,
  ListConstructionTrackingIssuesRequestModel,
  ListConstructionTrackingIssuesResponseModel,
  PostConstructionTrackingIssueProgressRequestModel,
  ReopenConstructionTrackingIssueRequestModel,
  UpdateConstructionTrackingIssueRequestModel,
} from "./issue-models";

const TAGS = ["Construction · Tracking"];

const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
];

const WRITE_ERRORS = [
  ...READ_ERRORS,
  StatusCodes.CONFLICT,
  StatusCodes.PAYMENT_REQUIRED,
];

const ITEM = `${ISSUES_PATH}/{id}`;

/** Request and Response models of `/api/construction/tracking/issues` (CM-803). */
export const trackingIssueOpenApiComponents: OpenApiComponents = {
  CreateConstructionTrackingIssueRequestModel,
  UpdateConstructionTrackingIssueRequestModel,
  DeleteConstructionTrackingIssueRequestModel,
  ReopenConstructionTrackingIssueRequestModel,
  BulkConstructionTrackingIssuesRequestModel,
  PostConstructionTrackingIssueProgressRequestModel,
  ConstructionTrackingIssueActionsResponseModel,
  ConstructionTrackingIssueResponseModel,
  ConstructionTrackingIssueHistoryItemResponseModel,
  ConstructionTrackingIssueDetailResponseModel,
  ListConstructionTrackingIssuesResponseModel,
  BulkConstructionTrackingIssuesResponseModel,
  ConstructionTrackingIssueProgressResponseModel,
  ListConstructionTrackingIssueProgressResponseModel,
  GetConstructionTrackingIssueFormOptionsResponseModel,
};

/** A POST on one issue that answers with the issue. */
function issueCommand(
  summary: string,
  path: string,
  body?: OpenApiOperation["body"],
): OpenApiOperation {
  return {
    method: "post",
    path,
    summary,
    tags: TAGS,
    params: ConstructionTrackingIssueParamsModel,
    ...(body == null ? {} : { body }),
    successStatus: StatusCodes.OK,
    successDescription: "The issue",
    successSchema: ConstructionTrackingIssueDetailResponseModel,
    errors: WRITE_ERRORS,
  };
}

/**
 * Issues & Snags routes (CM-803), menu `tracking.issues` on the issue's
 * Project: read, create, update (edit, Mark As Solved, Progress updates),
 * approve (Verify), reject (Reopen), delete; View all scopes every read.
 */
export const trackingIssueOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: ISSUES_PATH,
    summary: "A Project's Issues & Snags, newest first, with filters",
    tags: TAGS,
    query: ListConstructionTrackingIssuesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of issues",
    successSchema: ListConstructionTrackingIssuesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: ISSUES_PATH,
    summary: "Raise an issue (Save, or Save & Mark As Solved)",
    tags: TAGS,
    body: CreateConstructionTrackingIssueRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new issue",
    successSchema: ConstructionTrackingIssueDetailResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ISSUES_PATH}/form-options`,
    summary:
      "Team Members, Departments, Contractors and Issue Categories for the issue form",
    tags: TAGS,
    query: GetConstructionTrackingIssueFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The form's options",
    successSchema: GetConstructionTrackingIssueFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ISSUES_PATH}/bulk-solve`,
    summary: "Mark the selected open issues as solved (others are skipped)",
    tags: TAGS,
    body: BulkConstructionTrackingIssuesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were solved and skipped",
    successSchema: BulkConstructionTrackingIssuesResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ISSUES_PATH}/bulk-verify`,
    summary: "Verify (close) the selected solved issues (others are skipped)",
    tags: TAGS,
    body: BulkConstructionTrackingIssuesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "How many were closed and skipped",
    successSchema: BulkConstructionTrackingIssuesResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One issue with its lifecycle history",
    tags: TAGS,
    params: ConstructionTrackingIssueParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The issue",
    successSchema: ConstructionTrackingIssueDetailResponseModel,
    errors: READ_ERRORS,
  },
  issueCommand(
    "Edit an open issue",
    `${ITEM}/update`,
    UpdateConstructionTrackingIssueRequestModel,
  ),
  issueCommand("Mark an open issue as solved", `${ITEM}/solve`),
  issueCommand("Verify a solved issue (close it)", `${ITEM}/verify`),
  issueCommand(
    "Reopen a solved or closed issue, with a reason",
    `${ITEM}/reopen`,
    ReopenConstructionTrackingIssueRequestModel,
  ),
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete an issue",
    tags: TAGS,
    params: ConstructionTrackingIssueParamsModel,
    body: DeleteConstructionTrackingIssueRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${ITEM}/progress`,
    summary: "The issue's Progress thread",
    tags: TAGS,
    params: ConstructionTrackingIssueParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Its updates, oldest first",
    successSchema: ListConstructionTrackingIssueProgressResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/progress`,
    summary: "Post a Progress update (a comment and/or images)",
    tags: TAGS,
    params: ConstructionTrackingIssueParamsModel,
    body: PostConstructionTrackingIssueProgressRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new update",
    successSchema: ConstructionTrackingIssueProgressResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/progress/{updateId}/delete`,
    summary: "Delete your own Progress update within 24 hours",
    tags: TAGS,
    params: ConstructionTrackingIssueProgressParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
];
