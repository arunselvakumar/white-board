import { z } from "zod";

import {
  ConstructionProcurementSiteLocationModel,
  ConstructionProcurementSiteLocationResponseModel,
} from "@/app/api/construction/procurement/purchase-requests/purchase-request-models";
import { ConstructionTrackingDocumentFileResponseModel } from "@/app/api/construction/tracking/documents/document-models";
import { toTrackingEntryFileResponse } from "@/app/api/construction/tracking/documents/document-responses";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";
import {
  LOCATION_TYPES,
  type LocationType,
} from "@/src/shared-kernel/location-ref";
import type {
  InspectionActions,
  InspectionBulkOutcome,
  InspectionFormOptions,
  InspectionReadModel,
  InspectionStatusCounts,
  ObservationReadModel,
  RemarkReadModel,
} from "@/src/tracking/application/inspection-handlers";
import { TRACKING_ENTRY_FILES_MAX } from "@/src/tracking/domain/document-files";
import {
  INSPECTION_LIMITS,
  INSPECTION_STATUSES,
  type ReinspectionDraft,
} from "@/src/tracking/domain/inspection";

export const INSPECTIONS_PATH = "/api/construction/tracking/inspections";

const status = z.enum(INSPECTION_STATUSES);
type SiteLocation = z.infer<
  typeof ConstructionProcurementSiteLocationResponseModel
>;

const InspectionBody = z.object({
  /** `YYYY-MM-DD`; the back-dated limit (Site → Inspection Request) applies. It may be a later day. */
  inspectionDate: z.iso.date(),
  /** `HH:MM`, 24-hour, local time on site. */
  inspectionTime: z.string().max(5).nullable().optional(),
  /** An enabled Department (an unchanged disabled one may stay on edit). */
  departmentId: z.uuid().nullable().optional(),
  /** An active Contractor assigned to the Project, whose work is inspected. */
  contractorId: z.uuid().nullable().optional(),
  /** "Request Assign To": an active Team Member on the Project; optional. */
  inspectorMemberId: z.uuid().nullable().optional(),
  /** "Description of work". */
  workDescription: z.string().max(INSPECTION_LIMITS.workDescription),
  /** A place on the Project, checked against it on save. */
  siteLocation: ConstructionProcurementSiteLocationModel.nullable().optional(),
  /** Live Drawings of the same Project (Project Drawings). */
  drawingIds: z
    .array(z.uuid())
    .max(INSPECTION_LIMITS.drawings)
    .optional()
    .default([]),
});

export const CreateConstructionTrackingInspectionRequestModel =
  InspectionBody.extend({
    projectId: z.uuid(),
    /** **Raise re-inspection**: the rejected request of the same Project this one inspects again. */
    reinspectionOfId: z.uuid().nullable().optional(),
  });

export const UpdateConstructionTrackingInspectionRequestModel =
  InspectionBody.extend({
    /** The request's `updatedAt` as last seen; 409 `INSPECTION_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DeleteConstructionTrackingInspectionRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ApproveConstructionTrackingInspectionRequestModel = z.object({
  /** When sent, 409 `INSPECTION_CHANGED` if the request changed since. */
  expectedUpdatedAt: z.iso.datetime().optional(),
});

export const RejectConstructionTrackingInspectionRequestModel = z.object({
  reason: z.string().max(APPROVAL_LIMITS.maxTextLength),
  /**
   * **Also raise a snag**: an Issue & Snag in the same transaction
   * (category Quality, the request's contractor, department and location,
   * today's date). Needs Issues & Snags Create (403 `SNAG_NOT_ALLOWED`).
   */
  raiseSnag: z.boolean().optional().default(false),
  expectedUpdatedAt: z.iso.datetime().optional(),
});

export const BulkApproveConstructionTrackingInspectionsRequestModel = z.object({
  projectId: z.uuid(),
  ids: z.array(z.uuid()).min(1).max(APPROVAL_LIMITS.maxBulk),
});

export const BulkRejectConstructionTrackingInspectionsRequestModel =
  BulkApproveConstructionTrackingInspectionsRequestModel.extend({
    /** One reason for every request rejected. */
    reason: z.string().max(APPROVAL_LIMITS.maxTextLength),
    /** One snag per rejected request. */
    raiseSnag: z.boolean().optional().default(false),
  });

export const ConstructionTrackingInspectionParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionTrackingInspectionObservationParamsModel = z.object({
  id: z.uuid(),
  observationId: z.uuid(),
});

export const GetConstructionTrackingInspectionFormOptionsRequestModel =
  z.object({ projectId: z.uuid() });

export const AddConstructionTrackingInspectionObservationRequestModel =
  z.object({
    body: z.string().max(INSPECTION_LIMITS.observation).nullable().optional(),
    /**
     * Photos or files already uploaded to the request by the caller (not
     * yet on an entry), posted with this observation; with them the text
     * may be empty.
     */
    fileIds: z
      .array(z.uuid())
      .max(TRACKING_ENTRY_FILES_MAX)
      .optional()
      .default([]),
  });

export const AddConstructionTrackingInspectionRemarkRequestModel = z.object({
  body: z.string().max(INSPECTION_LIMITS.remark),
});

export const ListConstructionTrackingInspectionsRequestModel = z
  .object({
    projectId: z.uuid(),
    status: status.optional(),
    departmentId: z.uuid().optional(),
    contractorId: z.uuid().optional(),
    /** The inspector's Team Member id. */
    inspectorMemberId: z.uuid().optional(),
    /** With `locationId`: requests at this Wing, Amenity, Common Development or Location. */
    locationType: z
      .enum(
        LOCATION_TYPES.map((item) => item.key) as [
          LocationType,
          ...LocationType[],
        ],
      )
      .optional(),
    locationId: z.uuid().optional(),
    /** Inspection Date from / to (inclusive). */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** Part of the Request No or the description of work. */
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  })
  .refine(
    (value) => (value.locationType == null) === (value.locationId == null),
    {
      message: "locationType and locationId go together.",
      path: ["locationId"],
    },
  );

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });
const named = z.object({ id: z.uuid(), name: z.string().nullable() });
const inspectionRef = z.object({
  id: z.uuid(),
  number: z.string(),
  status,
});

export const ConstructionTrackingInspectionActionsResponseModel = z.object({
  /** Update, while pending. */
  edit: z.boolean(),
  /** Delete, while pending. */
  delete: z.boolean(),
  approve: z.boolean(),
  reject: z.boolean(),
  /** The inspector or Update, while pending. */
  observe: z.boolean(),
  remark: z.boolean(),
  /** Create, on a rejected request not yet inspected again. */
  reinspect: z.boolean(),
  /** Issues & Snags Create: the reject dialog offers **Also raise a snag**. */
  raiseSnag: z.boolean(),
  print: z.boolean(),
});

export const ConstructionTrackingInspectionResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  /** `IR/26-27/00001`. */
  number: z.string(),
  inspectionDate: z.iso.date(),
  /** `HH:MM`. */
  inspectionTime: z.string().nullable(),
  /** Pending for approval, Approved or Rejected. */
  status,
  department: named.nullable(),
  contractor: named.nullable(),
  inspector: z
    .object({ memberId: z.uuid(), name: z.string().nullable() })
    .nullable(),
  workDescription: z.string(),
  siteLocation: ConstructionProcurementSiteLocationResponseModel.nullable(),
  /** Linked Project Drawings; `albumId` opens the drawing's album (null once deleted). */
  drawings: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().nullable(),
      albumId: z.uuid().nullable(),
      albumName: z.string().nullable(),
      revision: z.number().int().nullable(),
    }),
  ),
  decidedAt: z.iso.datetime().nullable(),
  decidedBy: person.nullable(),
  rejectionReason: z.string().nullable(),
  /** The rejected request this one inspects again. */
  reinspectionOf: inspectionRef.nullable(),
  /** Requests raised to inspect this one again (live). */
  reinspections: z.array(inspectionRef),
  /** Issues & Snags raised from its rejection (live). */
  snags: z.array(z.object({ id: z.uuid(), number: z.string() })),
  createdBy: person,
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt`. */
  updatedAt: z.iso.datetime(),
  actions: ConstructionTrackingInspectionActionsResponseModel,
});
export type ConstructionTrackingInspectionResponse = z.infer<
  typeof ConstructionTrackingInspectionResponseModel
>;

export const ListConstructionTrackingInspectionsResponseModel = z.object({
  items: z.array(ConstructionTrackingInspectionResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
  /** Requests by status under the other filters (the status chips). */
  counts: z.object({
    pending: z.number().int(),
    approved: z.number().int(),
    rejected: z.number().int(),
  }),
});
export type ListConstructionTrackingInspectionsResponse = z.infer<
  typeof ListConstructionTrackingInspectionsResponseModel
>;

export const BulkDecideConstructionTrackingInspectionsResponseModel = z.object({
  /** Requests decided now. */
  decided: z.number().int(),
  /** Selected requests left alone: already decided, deleted or another Project's. */
  skipped: z.number().int(),
  /** One per rejected request when **Also raise a snag** was ticked. */
  snags: z.array(
    z.object({
      inspectionId: z.uuid(),
      issueId: z.uuid(),
      number: z.string(),
    }),
  ),
});
export type BulkDecideConstructionTrackingInspectionsResponse = z.infer<
  typeof BulkDecideConstructionTrackingInspectionsResponseModel
>;

export const GetConstructionTrackingInspectionFormOptionsResponseModel =
  z.object({
    /** Active Team Members on the Project (the Owner included), for Inspector. */
    members: z.array(
      z.object({ id: z.uuid(), name: z.string(), isOwner: z.boolean() }),
    ),
    /** Enabled Departments. */
    departments: z.array(z.object({ id: z.uuid(), name: z.string() })),
    /** Active Contractors assigned to the Project. */
    contractors: z.array(z.object({ id: z.uuid(), name: z.string() })),
    /** The Project's live Drawings, album then name. */
    drawings: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        albumName: z.string(),
        revision: z.number().int().nullable(),
      }),
    ),
  });
export type GetConstructionTrackingInspectionFormOptionsResponse = z.infer<
  typeof GetConstructionTrackingInspectionFormOptionsResponseModel
>;

export const GetConstructionTrackingInspectionReinspectionResponseModel =
  z.object({
    reinspectionOfId: z.uuid(),
    departmentId: z.uuid().nullable(),
    contractorId: z.uuid().nullable(),
    inspectorMemberId: z.uuid().nullable(),
    workDescription: z.string(),
    siteLocation: ConstructionProcurementSiteLocationResponseModel.nullable(),
    drawingIds: z.array(z.uuid()),
  });
export type GetConstructionTrackingInspectionReinspectionResponse = z.infer<
  typeof GetConstructionTrackingInspectionReinspectionResponseModel
>;

export const ConstructionTrackingInspectionObservationResponseModel = z.object({
  id: z.uuid(),
  body: z.string().nullable(),
  createdBy: person,
  createdAt: z.iso.datetime(),
  /** Photos and files posted with it, oldest first. */
  files: z.array(ConstructionTrackingDocumentFileResponseModel),
  /** The author, while the request is pending. */
  canDelete: z.boolean(),
});

export const ListConstructionTrackingInspectionObservationsResponseModel =
  z.object({
    items: z.array(ConstructionTrackingInspectionObservationResponseModel),
  });
export type ListConstructionTrackingInspectionObservationsResponse = z.infer<
  typeof ListConstructionTrackingInspectionObservationsResponseModel
>;

export const ConstructionTrackingInspectionRemarkResponseModel = z.object({
  id: z.uuid(),
  body: z.string(),
  createdBy: person,
  createdAt: z.iso.datetime(),
});

export const ListConstructionTrackingInspectionRemarksResponseModel = z.object({
  items: z.array(ConstructionTrackingInspectionRemarkResponseModel),
});
export type ListConstructionTrackingInspectionRemarksResponse = z.infer<
  typeof ListConstructionTrackingInspectionRemarksResponseModel
>;

export function toInspectionResponse(
  row: InspectionReadModel,
  actions: InspectionActions,
): ConstructionTrackingInspectionResponse {
  return {
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    inspectionDate: row.inspectionDate,
    inspectionTime: row.inspectionTime,
    status: row.status,
    department:
      row.departmentId == null
        ? null
        : { id: row.departmentId, name: row.departmentName },
    contractor:
      row.contractorId == null
        ? null
        : { id: row.contractorId, name: row.contractorName },
    inspector:
      row.inspectorMemberId == null
        ? null
        : { memberId: row.inspectorMemberId, name: row.inspectorName },
    workDescription: row.workDescription,
    siteLocation: row.siteLocation as SiteLocation | null,
    drawings: row.drawings,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedBy:
      row.decidedBy == null
        ? null
        : { userId: row.decidedBy, name: row.decidedByName },
    rejectionReason: row.rejectionReason,
    reinspectionOf: row.reinspectionOf,
    reinspections: row.reinspections,
    snags: row.snags,
    createdBy: { userId: row.createdBy, name: row.createdByName },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    actions,
  };
}

export function toInspectionCounts(
  counts: InspectionStatusCounts,
): ListConstructionTrackingInspectionsResponse["counts"] {
  return counts;
}

export function toBulkDecideResponse(
  outcome: InspectionBulkOutcome,
): BulkDecideConstructionTrackingInspectionsResponse {
  return {
    decided: outcome.decided.length,
    skipped: outcome.skipped,
    snags: outcome.snags.map((snag) => ({
      inspectionId: snag.inspectionId,
      issueId: snag.id,
      number: snag.number,
    })),
  };
}

export function toInspectionFormOptions(
  options: InspectionFormOptions,
): GetConstructionTrackingInspectionFormOptionsResponse {
  return {
    members: options.members.map((m) => ({
      id: m.id,
      name: m.name,
      isOwner: m.isOwner,
    })),
    departments: options.departments.map((d) => ({ id: d.id, name: d.name })),
    contractors: options.contractors.map((c) => ({ id: c.id, name: c.name })),
    drawings: options.drawings.map((d) => ({
      id: d.id,
      name: d.name,
      albumName: d.albumName,
      revision: d.revision,
    })),
  };
}

export function toReinspectionResponse(
  draft: ReinspectionDraft,
): GetConstructionTrackingInspectionReinspectionResponse {
  return {
    ...draft,
    siteLocation: draft.siteLocation as SiteLocation | null,
  };
}

export function toObservationResponse(
  row: ObservationReadModel,
): z.infer<typeof ConstructionTrackingInspectionObservationResponseModel> {
  return {
    id: row.id,
    body: row.body,
    createdBy: { userId: row.createdBy, name: row.createdByName },
    createdAt: row.createdAt.toISOString(),
    files: row.files.map((file) =>
      toTrackingEntryFileResponse(
        file,
        new Map(
          row.createdByName == null ? [] : [[row.createdBy, row.createdByName]],
        ),
      ),
    ),
    canDelete: row.canDelete,
  };
}

export function toRemarkResponse(
  row: RemarkReadModel,
): z.infer<typeof ConstructionTrackingInspectionRemarkResponseModel> {
  return {
    id: row.id,
    body: row.body,
    createdBy: { userId: row.createdBy, name: row.createdByName },
    createdAt: row.createdAt.toISOString(),
  };
}
