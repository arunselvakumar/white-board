import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  CloseConstructionSiteWorkEquipmentMaintenanceRequestModel,
  CompleteConstructionSiteWorkEquipmentPhotoRequestModel,
  ConstructionSiteWorkEquipmentActionsResponseModel,
  ConstructionSiteWorkEquipmentMaintenanceParamsModel,
  ConstructionSiteWorkEquipmentMaintenanceResponseModel,
  ConstructionSiteWorkEquipmentMovementResponseModel,
  ConstructionSiteWorkEquipmentParamsModel,
  ConstructionSiteWorkEquipmentResponseModel,
  ConstructionSiteWorkEquipmentSheetOptionResponseModel,
  CreateConstructionSiteWorkEquipmentRequestModel,
  DeleteConstructionSiteWorkEquipmentMaintenanceRequestModel,
  DeleteConstructionSiteWorkEquipmentRequestModel,
  EQUIPMENT_PATH,
  GetConstructionSiteWorkEquipmentFormOptionsRequestModel,
  GetConstructionSiteWorkEquipmentFormOptionsResponseModel,
  GetConstructionSiteWorkEquipmentResponseModel,
  GetConstructionSiteWorkEquipmentSheetOptionsRequestModel,
  GetConstructionSiteWorkEquipmentSheetOptionsResponseModel,
  ListConstructionSiteWorkEquipmentRequestModel,
  ListConstructionSiteWorkEquipmentResponseModel,
  OpenConstructionSiteWorkEquipmentMaintenanceRequestModel,
  PresignConstructionSiteWorkEquipmentPhotoUploadRequestModel,
  PresignConstructionSiteWorkEquipmentPhotoUploadResponseModel,
  SetConstructionSiteWorkEquipmentAvailabilityRequestModel,
  StartConstructionSiteWorkEquipmentPhotoUploadRequestModel,
  StartConstructionSiteWorkEquipmentPhotoUploadResponseModel,
  TransferConstructionSiteWorkEquipmentRequestModel,
  UpdateConstructionSiteWorkEquipmentMaintenanceRequestModel,
  UpdateConstructionSiteWorkEquipmentRequestModel,
} from "./equipment-models";

const TAGS = ["Construction · Site work"];

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

const ITEM = `${EQUIPMENT_PATH}/{id}`;
const ENTRY = `${ITEM}/maintenance/{maintenanceId}`;
const PHOTO = `${ITEM}/photo`;

/** Request and Response models of `/api/construction/site-work/equipment` (CM-603, CM-605). */
export const equipmentOpenApiComponents: OpenApiComponents = {
  CreateConstructionSiteWorkEquipmentRequestModel,
  UpdateConstructionSiteWorkEquipmentRequestModel,
  DeleteConstructionSiteWorkEquipmentRequestModel,
  TransferConstructionSiteWorkEquipmentRequestModel,
  SetConstructionSiteWorkEquipmentAvailabilityRequestModel,
  OpenConstructionSiteWorkEquipmentMaintenanceRequestModel,
  CloseConstructionSiteWorkEquipmentMaintenanceRequestModel,
  UpdateConstructionSiteWorkEquipmentMaintenanceRequestModel,
  DeleteConstructionSiteWorkEquipmentMaintenanceRequestModel,
  StartConstructionSiteWorkEquipmentPhotoUploadRequestModel,
  CompleteConstructionSiteWorkEquipmentPhotoRequestModel,
  ConstructionSiteWorkEquipmentResponseModel,
  ConstructionSiteWorkEquipmentMovementResponseModel,
  ConstructionSiteWorkEquipmentMaintenanceResponseModel,
  ConstructionSiteWorkEquipmentActionsResponseModel,
  GetConstructionSiteWorkEquipmentResponseModel,
  ListConstructionSiteWorkEquipmentResponseModel,
  ConstructionSiteWorkEquipmentSheetOptionResponseModel,
  GetConstructionSiteWorkEquipmentSheetOptionsResponseModel,
  GetConstructionSiteWorkEquipmentFormOptionsResponseModel,
  StartConstructionSiteWorkEquipmentPhotoUploadResponseModel,
  PresignConstructionSiteWorkEquipmentPhotoUploadRequestModel,
  PresignConstructionSiteWorkEquipmentPhotoUploadResponseModel,
};

function write(
  path: string,
  summary: string,
  body: OpenApiOperation["body"],
  params: OpenApiOperation["params"] = ConstructionSiteWorkEquipmentParamsModel,
): OpenApiOperation {
  return {
    method: "post",
    path,
    summary,
    tags: TAGS,
    params,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The equipment as it now is",
    successSchema: GetConstructionSiteWorkEquipmentResponseModel,
    errors: WRITE_ERRORS,
  };
}

/**
 * Equipment register routes (CM-603, CM-605). The register is the
 * Company-level `masters.equipments` menu (C R U D P N T O F); a Project's
 * equipment is also open to `site_work.equipment_usage` on that Project.
 */
export const equipmentOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: EQUIPMENT_PATH,
    summary:
      "The Equipment register, newest first, by ownership, place, state and search",
    tags: TAGS,
    query: ListConstructionSiteWorkEquipmentRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of equipment",
    successSchema: ListConstructionSiteWorkEquipmentResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: EQUIPMENT_PATH,
    summary: "Add equipment at a Project or the warehouse",
    tags: TAGS,
    body: CreateConstructionSiteWorkEquipmentRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new equipment",
    successSchema: GetConstructionSiteWorkEquipmentResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${EQUIPMENT_PATH}/form-options`,
    summary: "Hire parties (Contractors) and Projects for the equipment form",
    tags: TAGS,
    query: GetConstructionSiteWorkEquipmentFormOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The choices",
    successSchema: GetConstructionSiteWorkEquipmentFormOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: `${EQUIPMENT_PATH}/sheet-options`,
    summary:
      "Equipment that may take a usage sheet at a Project on a date, with its last closing reading",
    tags: TAGS,
    query: GetConstructionSiteWorkEquipmentSheetOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Allowed and blocked equipment",
    successSchema: GetConstructionSiteWorkEquipmentSheetOptionsResponseModel,
    errors: READ_ERRORS,
  },
  {
    method: "get",
    path: ITEM,
    summary: "One machine with its Transfer Report and maintenance log",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The equipment",
    successSchema: GetConstructionSiteWorkEquipmentResponseModel,
    errors: READ_ERRORS,
  },
  write(
    `${ITEM}/update`,
    "Edit the register's fields (Equipments Update)",
    UpdateConstructionSiteWorkEquipmentRequestModel,
  ),
  {
    method: "post",
    path: `${ITEM}/delete`,
    summary: "Delete equipment without usage sheets (Equipments Delete)",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentParamsModel,
    body: DeleteConstructionSiteWorkEquipmentRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: WRITE_ERRORS,
  },
  write(
    `${ITEM}/transfer`,
    "Transfer to Project / Transfer to Warehouse (Equipments Transfer)",
    TransferConstructionSiteWorkEquipmentRequestModel,
  ),
  write(
    `${ITEM}/availability`,
    "Mark unavailable for worksheet entry / Make it available (Equipments Update)",
    SetConstructionSiteWorkEquipmentAvailabilityRequestModel,
  ),
  write(
    `${ITEM}/maintenance`,
    "Log Maintenance: open the one maintenance entry (Equipments Update)",
    OpenConstructionSiteWorkEquipmentMaintenanceRequestModel,
  ),
  write(
    `${ENTRY}/close`,
    "Return to Service: close the open maintenance entry",
    CloseConstructionSiteWorkEquipmentMaintenanceRequestModel,
    ConstructionSiteWorkEquipmentMaintenanceParamsModel,
  ),
  write(
    `${ENTRY}/update`,
    "Edit a maintenance entry",
    UpdateConstructionSiteWorkEquipmentMaintenanceRequestModel,
    ConstructionSiteWorkEquipmentMaintenanceParamsModel,
  ),
  write(
    `${ENTRY}/delete`,
    "Delete a maintenance entry",
    DeleteConstructionSiteWorkEquipmentMaintenanceRequestModel,
    ConstructionSiteWorkEquipmentMaintenanceParamsModel,
  ),
  {
    method: "get",
    path: PHOTO,
    summary: "The equipment photo",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The image",
    successBinaryContentTypes: ["image/png", "image/jpeg", "image/webp"],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: PHOTO,
    summary:
      "Finish a photo upload: record the image at `key` (201 new, 200 when already recorded)",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentParamsModel,
    body: CompleteConstructionSiteWorkEquipmentPhotoRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The equipment with its photo",
    successSchema: GetConstructionSiteWorkEquipmentResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "get",
    path: `${PHOTO}/thumbnail`,
    summary: "The photo's WebP thumbnail",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thumbnail",
    successBinaryContentTypes: ["image/webp", "image/png", "image/jpeg"],
    errors: READ_ERRORS,
  },
  {
    method: "post",
    path: `${PHOTO}/remove`,
    summary: "Remove the photo",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The equipment without a photo",
    successSchema: GetConstructionSiteWorkEquipmentResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PHOTO}/uploads`,
    summary:
      "Start a photo upload: a PNG, JPEG or WebP image, at most 5 MB (Equipments Update, or Equipment Usage Create at its Project)",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentParamsModel,
    body: StartConstructionSiteWorkEquipmentPhotoUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "Where the bytes go",
    successSchema: StartConstructionSiteWorkEquipmentPhotoUploadResponseModel,
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PHOTO}/uploads/app`,
    summary:
      "Development and tests: the raw image at `?key=` (404 when deployed)",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentParamsModel,
    bodyBinaryContentTypes: ["application/octet-stream"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Received",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PHOTO}/uploads/thumbnail`,
    summary: "The image's WebP thumbnail at `?key=`, before finishing",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentParamsModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Received",
    errors: WRITE_ERRORS,
  },
  {
    method: "post",
    path: `${PHOTO}/uploads/presign`,
    summary:
      "Deployed: the `uploadPresigned()` handshake for one key (404 with files on disk)",
    tags: TAGS,
    params: ConstructionSiteWorkEquipmentParamsModel,
    body: PresignConstructionSiteWorkEquipmentPhotoUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema: PresignConstructionSiteWorkEquipmentPhotoUploadResponseModel,
    errors: WRITE_ERRORS,
  },
];
