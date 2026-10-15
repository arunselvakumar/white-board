import { z } from "zod";

import {
  ConstructionProcurementSiteLocationModel,
  ConstructionProcurementSiteLocationResponseModel,
} from "@/app/api/construction/procurement/purchase-requests/purchase-request-models";
import { ConstructionTrackingDocumentFileResponseModel } from "@/app/api/construction/tracking/documents/document-models";
import { toTrackingEntryFileResponse } from "@/app/api/construction/tracking/documents/document-responses";
import { TRACKING_ENTRY_FILES_MAX } from "@/src/tracking/domain/document-files";
import type {
  BulkResult,
  IssueActions,
  IssueFormOptions,
  IssueHistoryItem,
  IssueReadModel,
  IssueUpdateReadModel,
} from "@/src/tracking/application/issue-handlers";
import {
  ISSUE_LIMITS,
  ISSUE_STATUSES,
  ISSUE_STORED_STATUSES,
} from "@/src/tracking/domain/issue";
import { TRACKING_PRIORITIES } from "@/src/tracking/domain/tracking-documents";

export const ISSUES_PATH = "/api/construction/tracking/issues";

const priority = z.enum(
  TRACKING_PRIORITIES.map((item) => item.key) as ["high", "medium", "low"],
);
const status = z.enum(ISSUE_STATUSES);
const storedStatus = z.enum(ISSUE_STORED_STATUSES);
const locationType = z.enum([
  "wing",
  "amenity",
  "common_development",
  "location",
]);

/** "a,b,c" → ["a", "b", "c"]. */
const commaSeparated = z
  .string()
  .min(1)
  .max(400)
  .transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== ""),
  );

const IssueBody = z.object({
  /** `YYYY-MM-DD`, not after today; the back-dated limit applies to it. */
  issueDate: z.iso.date(),
  details: z.string().max(ISSUE_LIMITS.details),
  priority: priority.nullable().optional(),
  /** An enabled Issue Category (an unchanged disabled one may stay on edit). */
  categoryId: z.uuid().nullable().optional(),
  departmentId: z.uuid().nullable().optional(),
  /** An active Contractor assigned to the Project: whose work the snag is. */
  contractorId: z.uuid().nullable().optional(),
  /** "Assign To": a Team Member id (not a User id) on the Project. */
  assigneeMemberId: z.uuid().nullable().optional(),
  /** On or after the Issue Date. Past it, an open issue shows Delayed. */
  dueDate: z.iso.date().nullable().optional(),
  /** A place on the Project, checked against it on save. */
  siteLocation: ConstructionProcurementSiteLocationModel.nullable().optional(),
});

export const CreateConstructionTrackingIssueRequestModel = IssueBody.extend({
  projectId: z.uuid(),
  /** **Save & Mark As Solved**: create it solved (needs Create and Update). */
  markSolved: z.boolean().optional().default(false),
});

export const UpdateConstructionTrackingIssueRequestModel = IssueBody.extend({
  /** The issue's `updatedAt` as last seen; 409 `ISSUE_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const DeleteConstructionTrackingIssueRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ReopenConstructionTrackingIssueRequestModel = z.object({
  /** Why it is reopened; required. */
  reason: z.string().max(ISSUE_LIMITS.reopenReason),
});

export const BulkConstructionTrackingIssuesRequestModel = z.object({
  projectId: z.uuid(),
  ids: z.array(z.uuid()).min(1).max(ISSUE_LIMITS.bulk),
});

export const PostConstructionTrackingIssueProgressRequestModel = z.object({
  /** The comment; optional when images are posted with it. */
  body: z.string().max(ISSUE_LIMITS.updateBody).nullable().optional(),
  /**
   * Images uploaded to the issue first (`/api/construction/tracking/documents/issue/{id}/files`)
   * and not posted with another update yet; at most 10.
   */
  fileIds: z
    .array(z.uuid())
    .max(TRACKING_ENTRY_FILES_MAX)
    .optional()
    .default([]),
});

export const ConstructionTrackingIssueParamsModel = z.object({ id: z.uuid() });

export const ConstructionTrackingIssueProgressParamsModel = z.object({
  id: z.uuid(),
  updateId: z.uuid(),
});

export const GetConstructionTrackingIssueFormOptionsRequestModel = z.object({
  projectId: z.uuid(),
});

export const ListConstructionTrackingIssuesRequestModel = z
  .object({
    projectId: z.uuid(),
    /** Comma-separated: `pending,delayed`. Delayed is open past the Due Date. */
    status: commaSeparated.pipe(z.array(status).min(1).max(4)).optional(),
    /** Comma-separated: `high,medium`. */
    priority: commaSeparated.pipe(z.array(priority).min(1).max(3)).optional(),
    categoryId: z.uuid().optional(),
    /** A Team Member id. */
    assigneeMemberId: z.uuid().optional(),
    departmentId: z.uuid().optional(),
    contractorId: z.uuid().optional(),
    locationType: locationType.optional(),
    /** The Wing, Amenity, Common Development or Location id; needs `locationType`. */
    placeId: z.uuid().optional(),
    /** Issue Date range, both ends included. */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** Part of the number or the details. */
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  })
  .refine((value) => value.placeId == null || value.locationType != null, {
    message: "placeId needs locationType.",
    path: ["placeId"],
  });

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });
const named = z.object({ id: z.uuid(), name: z.string().nullable() });

export const ConstructionTrackingIssueActionsResponseModel = z.object({
  /** Update, while open. */
  edit: z.boolean(),
  delete: z.boolean(),
  /** Mark As Solved: Update, while open. */
  solve: z.boolean(),
  /** Verify: Approve, while solved. */
  verify: z.boolean(),
  /** Reopen: Reject, while solved or closed. */
  reopen: z.boolean(),
  /** Post a Progress update: Update. */
  postUpdate: z.boolean(),
});

export const ConstructionTrackingIssueResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  /** `ISS/26-27/00001`. */
  number: z.string(),
  issueDate: z.iso.date(),
  details: z.string(),
  priority: priority.nullable(),
  category: named.nullable(),
  department: named.nullable(),
  contractor: named.nullable(),
  /** The Team Member it is assigned to. */
  assignee: named.nullable(),
  dueDate: z.iso.date().nullable(),
  siteLocation: ConstructionProcurementSiteLocationResponseModel.nullable(),
  /** Pending / Delayed / Solved / Closed on the Company's today. */
  status,
  /** What is stored: Pending and Delayed are both `open`. */
  storedStatus,
  solvedAt: z.iso.datetime().nullable(),
  solvedBy: person.nullable(),
  closedAt: z.iso.datetime().nullable(),
  closedBy: person.nullable(),
  /** The rejected Inspection Request it was raised from ("Raised from IR/…"). */
  sourceInspection: z.object({ id: z.uuid(), number: z.string() }).nullable(),
  createdBy: person,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  actions: ConstructionTrackingIssueActionsResponseModel,
});
export type ConstructionTrackingIssueResponse = z.infer<
  typeof ConstructionTrackingIssueResponseModel
>;

export const ConstructionTrackingIssueHistoryItemResponseModel = z.object({
  id: z.uuid(),
  /** `created`, `edited`, `assigned`, `solved`, `closed`, `reopened`. */
  kind: z.string(),
  /** The reason a reopen gave. */
  reason: z.string().nullable(),
  /**
   * What changed: `{ fields }` for `edited`; `{ from, to, fromName, toName }`
   * (Team Members) for `assigned`; `{ from }` for `reopened`;
   * `{ sourceInspectionId }` for a `created` snag.
   */
  payload: z.unknown().nullable(),
  by: person,
  at: z.iso.datetime(),
});

export const ConstructionTrackingIssueDetailResponseModel =
  ConstructionTrackingIssueResponseModel.extend({
    /** The lifecycle history, oldest first. */
    history: z.array(ConstructionTrackingIssueHistoryItemResponseModel),
  });
export type ConstructionTrackingIssueDetailResponse = z.infer<
  typeof ConstructionTrackingIssueDetailResponseModel
>;

export const ListConstructionTrackingIssuesResponseModel = z.object({
  items: z.array(ConstructionTrackingIssueResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});
export type ListConstructionTrackingIssuesResponse = z.infer<
  typeof ListConstructionTrackingIssuesResponseModel
>;

export const BulkConstructionTrackingIssuesResponseModel = z.object({
  /** Issues the action applied to. */
  done: z.number().int(),
  /** Selected issues in another state (or no longer there), left as they were. */
  skipped: z.number().int(),
});
export type BulkConstructionTrackingIssuesResponse = z.infer<
  typeof BulkConstructionTrackingIssuesResponseModel
>;

export const ConstructionTrackingIssueProgressResponseModel = z.object({
  id: z.uuid(),
  issueId: z.uuid(),
  body: z.string().nullable(),
  /** Its images, oldest first. */
  files: z.array(ConstructionTrackingDocumentFileResponseModel),
  by: person,
  createdAt: z.iso.datetime(),
  /** The viewer posted it less than 24 hours ago. */
  canDelete: z.boolean(),
});
export type ConstructionTrackingIssueProgressResponse = z.infer<
  typeof ConstructionTrackingIssueProgressResponseModel
>;

export const ListConstructionTrackingIssueProgressResponseModel = z.object({
  /** Oldest first. */
  items: z.array(ConstructionTrackingIssueProgressResponseModel),
});
export type ListConstructionTrackingIssueProgressResponse = z.infer<
  typeof ListConstructionTrackingIssueProgressResponseModel
>;

const option = z.object({ id: z.uuid(), name: z.string() });

export const GetConstructionTrackingIssueFormOptionsResponseModel = z.object({
  /** Active Team Members on the Project (the Owner included): "Assign To". */
  members: z.array(option.extend({ isOwner: z.boolean() })),
  /** Enabled Departments. */
  departments: z.array(option),
  /** Active Contractors assigned to the Project. */
  contractors: z.array(option.extend({ departmentIds: z.array(z.uuid()) })),
  /** Enabled Issue Categories. */
  issueCategories: z.array(option),
});
export type GetConstructionTrackingIssueFormOptionsResponse = z.infer<
  typeof GetConstructionTrackingIssueFormOptionsResponseModel
>;

const iso = (value: Date | null) =>
  value == null ? null : value.toISOString();

export function toIssueResponse(
  issue: IssueReadModel,
  actions: IssueActions,
): ConstructionTrackingIssueResponse {
  return {
    id: issue.id,
    projectId: issue.projectId,
    number: issue.number,
    issueDate: issue.issueDate,
    details: issue.details,
    priority: issue.priority,
    category: issue.category,
    department: issue.department,
    contractor: issue.contractor,
    assignee: issue.assignee,
    dueDate: issue.dueDate,
    siteLocation:
      issue.siteLocation == null
        ? null
        : (issue.siteLocation as z.infer<
            typeof ConstructionProcurementSiteLocationResponseModel
          >),
    status: issue.displayStatus,
    storedStatus: issue.status,
    solvedAt: iso(issue.solvedAt),
    solvedBy: issue.solvedByPerson,
    closedAt: iso(issue.closedAt),
    closedBy: issue.closedByPerson,
    sourceInspection: issue.sourceInspection,
    createdBy: issue.createdByPerson,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    actions,
  };
}

export function toIssueDetailResponse(
  issue: IssueReadModel & { history: IssueHistoryItem[] },
  actions: IssueActions,
): ConstructionTrackingIssueDetailResponse {
  return {
    ...toIssueResponse(issue, actions),
    history: issue.history.map((item) => ({
      id: item.id,
      kind: item.kind,
      reason: item.reason,
      payload: item.payload ?? null,
      by: item.by,
      at: item.createdAt.toISOString(),
    })),
  };
}

export function toIssueProgressResponse(
  update: IssueUpdateReadModel,
): ConstructionTrackingIssueProgressResponse {
  return {
    id: update.id,
    issueId: update.issueId,
    body: update.body,
    files: update.files.map((file) =>
      toTrackingEntryFileResponse(file, update.fileUploaders),
    ),
    by: update.by,
    createdAt: update.createdAt.toISOString(),
    canDelete: update.canDelete,
  };
}

export function toIssueFormOptions(
  options: IssueFormOptions,
): GetConstructionTrackingIssueFormOptionsResponse {
  return {
    members: options.members.map((member) => ({
      id: member.id,
      name: member.name,
      isOwner: member.isOwner,
    })),
    departments: options.departments.map(({ id, name }) => ({ id, name })),
    contractors: options.contractors.map((contractor) => ({
      id: contractor.id,
      name: contractor.name,
      departmentIds: [...contractor.departmentIds],
    })),
    issueCategories: options.issueCategories.map(({ id, name }) => ({
      id,
      name,
    })),
  };
}

export function toBulkResponse(
  result: BulkResult,
): BulkConstructionTrackingIssuesResponse {
  return result;
}
