import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  PROCUREMENT_TAGS,
  READ_ERRORS,
  WRITE_ERRORS,
} from "../stores/stores-openapi";
import {
  ApproveConstructionProcurementDeliveryNotesRequestModel,
  ConstructionProcurementDeliveryNoteParamsModel,
  ConstructionProcurementDeliveryNoteResponseModel,
  CreateConstructionProcurementDeliveryNoteRequestModel,
  DELIVERY_NOTES_PATH,
  DeleteConstructionProcurementDeliveryNoteRequestModel,
  ListConstructionProcurementDeliveryNotesRequestModel,
  ListConstructionProcurementDeliveryNotesResponseModel,
  MarkConstructionProcurementDeliveryNoteDeliveredRequestModel,
  UpdateConstructionProcurementDeliveryNoteRequestModel,
} from "./delivery-note-models";

const ITEM = `${DELIVERY_NOTES_PATH}/{id}`;

/** Request and Response models of `/api/construction/procurement/delivery-notes` (M5). */
export const deliveryNoteOpenApiComponents: OpenApiComponents = {
  CreateConstructionProcurementDeliveryNoteRequestModel,
  UpdateConstructionProcurementDeliveryNoteRequestModel,
  DeleteConstructionProcurementDeliveryNoteRequestModel,
  ApproveConstructionProcurementDeliveryNotesRequestModel,
  MarkConstructionProcurementDeliveryNoteDeliveredRequestModel,
  ConstructionProcurementDeliveryNoteResponseModel,
  ListConstructionProcurementDeliveryNotesResponseModel,
};

/** Operations of `/api/construction/procurement/delivery-notes` (CM-508; menu `procurement.delivery_notes`). */
export const deliveryNoteOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: DELIVERY_NOTES_PATH,
    summary:
      "Delivery Notes, newest first, by store, Project, request and status (read, or Material Requests read on the Project)",
    tags: PROCUREMENT_TAGS,
    query: ListConstructionProcurementDeliveryNotesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of notes",
    successSchema: ListConstructionProcurementDeliveryNotesResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: DELIVERY_NOTES_PATH,
    summary:
      "Create a Delivery Note from a Material Request; approve: true dispatches at once (create, + approve; DELIVERY_NOTE_EXCEEDS_PENDING, STOCK_INSUFFICIENT, MATERIAL_REQUEST_NOT_OPEN 409)",
    tags: PROCUREMENT_TAGS,
    body: CreateConstructionProcurementDeliveryNoteRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The note",
    successSchema: ConstructionProcurementDeliveryNoteResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${DELIVERY_NOTES_PATH}/approve`,
    summary:
      "Approve several pending notes, all or none (approve; BULK_DECISION_REFUSED, STOCK_INSUFFICIENT 409)",
    tags: PROCUREMENT_TAGS,
    body: ApproveConstructionProcurementDeliveryNotesRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Approved",
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One Delivery Note",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementDeliveryNoteParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The note",
    successSchema: ConstructionProcurementDeliveryNoteResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/update`,
    summary: "Edit a pending note (update; DELIVERY_NOTE_NOT_PENDING, DELIVERY_NOTE_CHANGED 409)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementDeliveryNoteParamsModel,
    body: UpdateConstructionProcurementDeliveryNoteRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The note",
    successSchema: ConstructionProcurementDeliveryNoteResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete a pending note (delete; DELIVERY_NOTE_NOT_PENDING 409)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementDeliveryNoteParamsModel,
    body: DeleteConstructionProcurementDeliveryNoteRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/approve`,
    summary:
      "Approve = dispatch: Issued at the store on the note's date (approve; DELIVERY_NOTE_NOT_PENDING, STOCK_INSUFFICIENT 409)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementDeliveryNoteParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The note, in transit",
    successSchema: ConstructionProcurementDeliveryNoteResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${ITEM}/mark-delivered`,
    summary:
      "Mark as Delivered: Received from store at the Project; the Material Request moves towards delivered (update, or Material Requests update on the Project; DELIVERY_NOTE_NOT_IN_TRANSIT 409)",
    tags: PROCUREMENT_TAGS,
    params: ConstructionProcurementDeliveryNoteParamsModel,
    body: MarkConstructionProcurementDeliveryNoteDeliveredRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The delivered note",
    successSchema: ConstructionProcurementDeliveryNoteResponseModel,
    errors: WRITE_ERRORS,
  },
];
