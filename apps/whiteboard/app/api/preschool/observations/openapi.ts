import { StatusCodes } from "http-status-codes";

import type { OpenApiOperation } from "@/app/api/_lib/openapi";

import type { PreschoolOpenApi } from "../_lib/openapi";
import {
  CreatePreschoolObservationRequestModel,
  ListPreschoolDomainsRequestModel,
  ListPreschoolDomainsResponseModel,
  ListPreschoolObservationsRequestModel,
  ListPreschoolObservationsResponseModel,
  PreschoolDevelopmentDomainModel,
  PreschoolObservationModel,
  PreschoolObservationParamsModel,
  SavePreschoolDomainRequestModel,
  UpdatePreschoolObservationRequestModel,
} from "./observation-models";

const PATH = "/api/preschool/observations";
const tags = ["Preschool"];
const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
];

function domainCommand(path: string, summary: string): OpenApiOperation {
  return {
    method: "post",
    path: `${PATH}/domains/{id}/${path}`,
    summary,
    tags,
    params: PreschoolObservationParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Development Domain",
    successSchema: PreschoolDevelopmentDomainModel,
    errors: ERRORS,
  };
}

export const observationsOpenApi: PreschoolOpenApi = {
  operations: [
    {
      method: "get",
      path: PATH,
      summary: "One Child's or one Classroom's Observations, newest first",
      tags,
      query: ListPreschoolObservationsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "A page of Observations",
      successSchema: ListPreschoolObservationsResponseModel,
      errors: ERRORS,
    },
    {
      method: "post",
      path: PATH,
      summary: "Record an Observation on a Child",
      tags,
      body: CreatePreschoolObservationRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: "The Observation",
      successSchema: PreschoolObservationModel,
      errors: ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/{id}/details`,
      summary: "Edit an Observation",
      tags,
      params: PreschoolObservationParamsModel,
      body: UpdatePreschoolObservationRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "The Observation",
      successSchema: PreschoolObservationModel,
      errors: ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/{id}/remove`,
      summary: "Remove an Observation",
      tags,
      params: PreschoolObservationParamsModel,
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Removed",
      errors: ERRORS,
    },
    {
      method: "get",
      path: `${PATH}/domains`,
      summary: "The Development Domains",
      tags,
      query: ListPreschoolDomainsRequestModel,
      successStatus: StatusCodes.OK,
      successDescription: "In order",
      successSchema: ListPreschoolDomainsResponseModel,
      errors: ERRORS,
    },
    {
      method: "post",
      path: `${PATH}/domains`,
      summary: "Add a Development Domain (the Owner)",
      tags,
      body: SavePreschoolDomainRequestModel,
      successStatus: StatusCodes.CREATED,
      successDescription: "The Development Domain",
      successSchema: PreschoolDevelopmentDomainModel,
      errors: ERRORS,
    },
    {
      ...domainCommand("details", "Rename a Development Domain (the Owner)"),
      body: SavePreschoolDomainRequestModel,
    },
    domainCommand("archive", "Archive a Development Domain (the Owner)"),
    domainCommand("restore", "Restore a Development Domain (the Owner)"),
  ],
  components: {
    PreschoolDevelopmentDomainModel,
    PreschoolObservationModel,
    ListPreschoolObservationsResponseModel,
    ListPreschoolDomainsResponseModel,
    CreatePreschoolObservationRequestModel,
    UpdatePreschoolObservationRequestModel,
    SavePreschoolDomainRequestModel,
  },
};
