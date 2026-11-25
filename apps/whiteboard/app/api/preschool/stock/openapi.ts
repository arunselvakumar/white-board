import { StatusCodes } from "http-status-codes";

import type { OpenApiOperation } from "@/app/api/_lib/openapi";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  AdjustPreschoolStockRequestModel,
  IssuePreschoolStockToChildRequestModel,
  IssuePreschoolStockToClassroomRequestModel,
  IssuePreschoolStockToStaffRequestModel,
  ListPreschoolStockItemsRequestModel,
  ListPreschoolStockMovementsRequestModel,
  ListPreschoolStockRequestModel,
  PreschoolChildStockIssuedResponseModel,
  PreschoolStockChildParamsModel,
  PreschoolStockIdParamsModel,
  PreschoolStockItemDetailsRequestModel,
  PreschoolStockItemListResponseModel,
  PreschoolStockItemModel,
  PreschoolStockLedgerResponseModel,
  PreschoolStockMovementResultModel,
  PreschoolStockOnHandResponseModel,
  ReceivePreschoolStockRequestModel,
  TransferPreschoolStockRequestModel,
} from "./stock-models";

const tags = ["Preschool"];
const AUTH = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];
const READ = [...AUTH, StatusCodes.BAD_REQUEST];
const BY_ID = [...READ, StatusCodes.NOT_FOUND];
const WRITE = [...BY_ID, StatusCodes.CONFLICT];

function movement(
  path: string,
  summary: string,
  body: OpenApiOperation["body"],
): OpenApiOperation {
  return {
    method: "post",
    path: `/api/preschool/stock/${path}`,
    summary,
    tags,
    body,
    successStatus: StatusCodes.CREATED,
    successDescription: "The movements written and stock on hand after them",
    successSchema: PreschoolStockMovementResultModel,
    errors: WRITE,
  };
}

function itemAction(action: string, summary: string): OpenApiOperation {
  return {
    method: "post",
    path: `/api/preschool/stock/items/{id}/${action}`,
    summary,
    tags,
    params: PreschoolStockIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Stock Item",
    successSchema: PreschoolStockItemModel,
    errors: WRITE,
  };
}

export const stockOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: "/api/preschool/stock/items",
      summary: "List Stock Items (Owner, Centre Head, Teacher)",
      tags,
      query: ListPreschoolStockItemsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "Stock Items by category and name",
      successSchema: PreschoolStockItemListResponseModel,
      errors: READ,
    },
    {
      method: "post",
      path: "/api/preschool/stock/items",
      summary: "Add a Stock Item (Owner)",
      tags,
      body: PreschoolStockItemDetailsRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: "The new Stock Item",
      successSchema: PreschoolStockItemModel,
      errors: [...READ, StatusCodes.CONFLICT],
    },
    {
      ...itemAction("details", "Change a Stock Item (Owner)"),
      body: PreschoolStockItemDetailsRequestModel,
    },
    itemAction("archive", "Archive a Stock Item (Owner)"),
    itemAction("restore", "Restore an archived Stock Item (Owner)"),
    {
      method: "get",
      path: "/api/preschool/stock",
      summary: "Stock on hand at a Centre",
      tags,
      query: ListPreschoolStockRequestModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "Every Stock Item with stock on hand, its reorder level and whether it is low",
      successSchema: PreschoolStockOnHandResponseModel,
      errors: READ,
    },
    movement(
      "receive",
      "Receive stock at a Centre",
      ReceivePreschoolStockRequestModel,
    ),
    movement(
      "issue-to-child",
      "Issue stock to a Child",
      IssuePreschoolStockToChildRequestModel,
    ),
    movement(
      "issue-to-classroom",
      "Issue stock to a Classroom",
      IssuePreschoolStockToClassroomRequestModel,
    ),
    movement(
      "issue-to-staff",
      "Issue stock to a Staff member",
      IssuePreschoolStockToStaffRequestModel,
    ),
    movement(
      "adjust",
      "Adjust stock on hand, with the reason",
      AdjustPreschoolStockRequestModel,
    ),
    movement(
      "transfer",
      "Send stock to another Centre (Owner)",
      TransferPreschoolStockRequestModel,
    ),
    {
      method: "get",
      path: "/api/preschool/stock/movements",
      summary: "A Centre's Stock Movements, newest first",
      tags,
      query: ListPreschoolStockMovementsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription:
        "A page of movements; with one item, the running balance",
      successSchema: PreschoolStockLedgerResponseModel,
      errors: BY_ID,
    },
    {
      method: "get",
      path: "/api/preschool/stock/children/{childId}",
      summary: "What a Child has been issued",
      tags,
      params: PreschoolStockChildParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "Items handed to the Child, newest first",
      successSchema: PreschoolChildStockIssuedResponseModel,
      errors: BY_ID,
    },
  ],
  components: {
    PreschoolStockItemModel,
    PreschoolStockItemListResponseModel,
    PreschoolStockItemDetailsRequestModel,
    PreschoolStockOnHandResponseModel,
    ReceivePreschoolStockRequestModel,
    IssuePreschoolStockToChildRequestModel,
    IssuePreschoolStockToClassroomRequestModel,
    IssuePreschoolStockToStaffRequestModel,
    AdjustPreschoolStockRequestModel,
    TransferPreschoolStockRequestModel,
    PreschoolStockMovementResultModel,
    PreschoolStockLedgerResponseModel,
    PreschoolChildStockIssuedResponseModel,
  },
};
