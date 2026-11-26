import { StatusCodes } from "http-status-codes";

import type { OpenApiOperation } from "@/app/api/_lib/openapi";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  CreatePreschoolEnquiryRequestModel,
  ListPreschoolEnquiriesRequestModel,
  ListPreschoolEnquiriesResponseModel,
  LogPreschoolEnquiryFollowUpRequestModel,
  MarkPreschoolEnquiryLostRequestModel,
  MovePreschoolEnquiryRequestModel,
  PreschoolEnquiryActivityModel,
  PreschoolEnquiryDetailModel,
  PreschoolEnquiryModel,
  PreschoolEnquiryParamsModel,
  PreschoolEnquiryPhoneMatchesRequestModel,
  PreschoolEnquiryPhoneMatchesResponseModel,
  PreschoolEnquirySummaryRequestModel,
  PreschoolEnquirySummaryResponseModel,
  ReopenPreschoolEnquiryRequestModel,
  UpdatePreschoolEnquiryDetailsRequestModel,
} from "./enquiry-models";

const PATH = "/api/preschool/enquiries";
const tags = ["Preschool"];
const READ_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
];
const WRITE_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
];

function command(
  path: string,
  summary: string,
  body: OpenApiOperation["body"],
): OpenApiOperation {
  return {
    method: "post",
    path: `${PATH}/{id}/${path}`,
    summary,
    tags,
    params: PreschoolEnquiryParamsModel,
    body,
    successStatus: StatusCodes.OK,
    successDescription: "The Enquiry with its activities",
    successSchema: PreschoolEnquiryDetailModel,
    errors: WRITE_ERRORS,
  };
}

export const enquiriesOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: PATH,
      summary: "A Centre's Enquiries, newest first (Owner and Centre Head)",
      tags,
      query: ListPreschoolEnquiriesRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "A page of Enquiries and the total",
      successSchema: ListPreschoolEnquiriesResponseModel,
      errors: READ_ERRORS,
    },
    {
      method: "post",
      path: PATH,
      summary: "Record an Enquiry",
      tags,
      body: CreatePreschoolEnquiryRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: "The new Enquiry",
      successSchema: PreschoolEnquiryDetailModel,
      errors: WRITE_ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/summary`,
      summary: "Enquiries per status and follow-ups due",
      tags,
      query: PreschoolEnquirySummaryRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "Counts for the pipeline and the dashboard",
      successSchema: PreschoolEnquirySummaryResponseModel,
      errors: READ_ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/phone-matches`,
      summary: "Open Enquiries and Children with this parent phone",
      tags,
      query: PreschoolEnquiryPhoneMatchesRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "Possible duplicates",
      successSchema: PreschoolEnquiryPhoneMatchesResponseModel,
      errors: READ_ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/{id}`,
      summary: "One Enquiry with its activities",
      tags,
      params: PreschoolEnquiryParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Enquiry, activities newest first",
      successSchema: PreschoolEnquiryDetailModel,
      errors: [...READ_ERRORS, StatusCodes.NOT_FOUND],
    },
    command(
      "details",
      "Edit an Enquiry's details",
      UpdatePreschoolEnquiryDetailsRequestModel,
    ),
    command(
      "follow-ups",
      "Log a call, visit or note",
      LogPreschoolEnquiryFollowUpRequestModel,
    ),
    command(
      "status",
      "Move an Enquiry to Contacted, Visit scheduled or Visited",
      MovePreschoolEnquiryRequestModel,
    ),
    command(
      "lost",
      "Mark an Enquiry lost",
      MarkPreschoolEnquiryLostRequestModel,
    ),
    command(
      "reopen",
      "Reopen a lost Enquiry",
      ReopenPreschoolEnquiryRequestModel,
    ),
  ],
  components: {
    PreschoolEnquiryModel,
    PreschoolEnquiryActivityModel,
    PreschoolEnquiryDetailModel,
    CreatePreschoolEnquiryRequestModel,
    UpdatePreschoolEnquiryDetailsRequestModel,
    LogPreschoolEnquiryFollowUpRequestModel,
    MovePreschoolEnquiryRequestModel,
    MarkPreschoolEnquiryLostRequestModel,
    ReopenPreschoolEnquiryRequestModel,
    ListPreschoolEnquiriesResponseModel,
    PreschoolEnquirySummaryResponseModel,
    PreschoolEnquiryPhoneMatchesResponseModel,
  },
};
