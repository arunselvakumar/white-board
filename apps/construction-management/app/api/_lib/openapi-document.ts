import { StatusCodes } from "http-status-codes";

import { SwitchConstructionOrganizationCompanyParamsModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-params-model";
import { SwitchConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-response-model";
import { CreateConstructionOrganizationCompanyRequestModel } from "@/app/api/construction/organization/companies/create-company-request-model";
import { CreateConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/create-company-response-model";
import { ListMyConstructionOrganizationCompaniesResponseModel } from "@/app/api/construction/organization/companies/me/list-my-companies-response-model";
import { GetConstructionOrganizationCompanyProfileResponseModel } from "@/app/api/construction/organization/company-profile/get-company-profile-response-model";
import {
  GetConstructionOrganizationJoinLinkResponseModel,
  JoinLinkTokenParamsModel,
} from "@/app/api/construction/organization/join-links/[token]/join-link-models";
import { AssignConstructionOrganizationTeamMemberProjectsRequestModel } from "@/app/api/construction/organization/team-members/[id]/projects/assign-projects-request-model";
import { SetConstructionOrganizationTeamMemberPermissionsRequestModel } from "@/app/api/construction/organization/team-members/[id]/permissions/set-permissions-request-model";
import { RevealConstructionOrganizationTeamMemberIdsResponseModel } from "@/app/api/construction/organization/team-members/[id]/reveal/reveal-response-model";
import { UpdateConstructionOrganizationTeamMemberRequestModel } from "@/app/api/construction/organization/team-members/[id]/update/update-team-member-request-model";
import { CreateConstructionOrganizationTeamMemberRequestModel } from "@/app/api/construction/organization/team-members/create-team-member-request-model";
import { ListConstructionOrganizationTeamMembersRequestModel } from "@/app/api/construction/organization/team-members/list-team-members-request-model";
import { ListConstructionOrganizationTeamMembersResponseModel } from "@/app/api/construction/organization/team-members/list-team-members-response-model";
import {
  ConstructionOrganizationTeamMemberResponseModel,
  TeamMemberIdParamsModel,
} from "@/app/api/construction/organization/team-members/team-member-models";
import {
  AcceptConstructionOrganizationJoinRequestResponseModel,
  JoinRequestIdParamsModel,
  ListConstructionOrganizationJoinRequestsResponseModel,
} from "@/app/api/construction/organization/join-requests/join-request-models";
import { ConstructionOrganizationDesignationParamsModel } from "@/app/api/construction/organization/designations/[id]/designation-params-model";
import { DuplicateConstructionOrganizationDesignationRequestModel } from "@/app/api/construction/organization/designations/[id]/duplicate/duplicate-designation-request-model";
import { UpdateConstructionOrganizationDesignationRequestModel } from "@/app/api/construction/organization/designations/[id]/update/update-designation-request-model";
import { CreateConstructionOrganizationDesignationRequestModel } from "@/app/api/construction/organization/designations/create-designation-request-model";
import { ConstructionOrganizationDesignationResponseModel } from "@/app/api/construction/organization/designations/designation-response-model";
import { ListConstructionOrganizationDesignationsResponseModel } from "@/app/api/construction/organization/designations/list-designations-response-model";

import { GetConstructionOrganizationBackdatedEntryPolicyResponseModel } from "@/app/api/construction/organization/settings/backdated-entry/get-backdated-entry-policy-response-model";
import { UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel } from "@/app/api/construction/organization/settings/backdated-entry/update/update-backdated-entry-policy-request-model";
import { UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel } from "@/app/api/construction/organization/settings/backdated-entry/update/update-backdated-entry-policy-response-model";
import { ConstructionOrganizationSequenceRuleParamsModel } from "@/app/api/construction/organization/settings/sequence-rules/[id]/sequence-rule-params-model";
import {
  UpdateConstructionOrganizationSequenceRuleRequestModel,
  UpdateConstructionOrganizationSequenceRuleResponseModel,
} from "@/app/api/construction/organization/settings/sequence-rules/[id]/update/update-sequence-rule-models";
import {
  CreateConstructionOrganizationSequenceRuleRequestModel,
  CreateConstructionOrganizationSequenceRuleResponseModel,
} from "@/app/api/construction/organization/settings/sequence-rules/create-sequence-rule-models";
import {
  ListConstructionOrganizationSequenceRulesQueryModel,
  ListConstructionOrganizationSequenceRulesResponseModel,
} from "@/app/api/construction/organization/settings/sequence-rules/list-sequence-rules-models";
import {
  buildOpenApiDocument,
  type OpenApiComponents,
  type OpenApiOperation,
} from "./openapi";

const ORGANIZATION = ["Construction · Organization"];

const SESSION_ERRORS = [
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
] as const;

/**
 * Every Request and Response model, keyed by its code name. Names are global
 * in `/api/docs`, so each carries `Construction<Context>` (ADR CM-0001).
 */
export const openApiComponents: OpenApiComponents = {
  CreateConstructionOrganizationCompanyRequestModel,
  CreateConstructionOrganizationCompanyResponseModel,
  ListMyConstructionOrganizationCompaniesResponseModel,
  SwitchConstructionOrganizationCompanyResponseModel,
  GetConstructionOrganizationCompanyProfileResponseModel,
  ListConstructionOrganizationJoinRequestsResponseModel,
  AcceptConstructionOrganizationJoinRequestResponseModel,
  GetConstructionOrganizationJoinLinkResponseModel,
  ConstructionOrganizationTeamMemberResponseModel,
  ListConstructionOrganizationTeamMembersResponseModel,
  CreateConstructionOrganizationTeamMemberRequestModel,
  UpdateConstructionOrganizationTeamMemberRequestModel,
  SetConstructionOrganizationTeamMemberPermissionsRequestModel,
  AssignConstructionOrganizationTeamMemberProjectsRequestModel,
  RevealConstructionOrganizationTeamMemberIdsResponseModel,
  ListConstructionOrganizationDesignationsResponseModel,
  ConstructionOrganizationDesignationResponseModel,
  CreateConstructionOrganizationDesignationRequestModel,
  UpdateConstructionOrganizationDesignationRequestModel,
  DuplicateConstructionOrganizationDesignationRequestModel,
  GetConstructionOrganizationBackdatedEntryPolicyResponseModel,
  UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel,
  UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel,
  ListConstructionOrganizationSequenceRulesResponseModel,
  CreateConstructionOrganizationSequenceRuleRequestModel,
  CreateConstructionOrganizationSequenceRuleResponseModel,
  UpdateConstructionOrganizationSequenceRuleRequestModel,
  UpdateConstructionOrganizationSequenceRuleResponseModel,
};

const DESIGNATIONS = "/api/construction/organization/designations";

/** Every route. A route is unfinished until it is listed here (root ADR-0012). */
export const openApiOperations: OpenApiOperation[] = [
  {
    method: "post",
    path: "/api/construction/organization/companies",
    summary: "Create a Company with the caller as Owner and make it active",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationCompanyRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Company, on a 14-day trial",
    successSchema: CreateConstructionOrganizationCompanyResponseModel,
    errors: [StatusCodes.BAD_REQUEST, StatusCodes.UNAUTHORIZED],
  },
  {
    method: "get",
    path: "/api/construction/organization/companies/me",
    summary: "The signed-in User's Companies",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Companies and the Active Company",
    successSchema: ListMyConstructionOrganizationCompaniesResponseModel,
    errors: [StatusCodes.UNAUTHORIZED],
  },
  {
    method: "post",
    path: "/api/construction/organization/companies/{id}/switch",
    summary: "Make one of the caller's Companies active",
    tags: ORGANIZATION,
    params: SwitchConstructionOrganizationCompanyParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The new Active Company",
    successSchema: SwitchConstructionOrganizationCompanyResponseModel,
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: "/api/construction/organization/company-profile",
    summary: "The Active Company's profile",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The Company profile",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: DESIGNATIONS,
    summary:
      "Every live Designation of the Active Company, by name (a few dozen, so not paged)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Designations and their Permission Templates",
    successSchema: ListConstructionOrganizationDesignationsResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: DESIGNATIONS,
    summary:
      "Add a Designation, optionally with a Permission Template (unsupported cells are dropped)",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationDesignationRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Designation",
    successSchema: ConstructionOrganizationDesignationResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${DESIGNATIONS}/{id}`,
    summary: "One Designation with its Permission Template",
    tags: ORGANIZATION,
    params: ConstructionOrganizationDesignationParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Designation",
    successSchema: ConstructionOrganizationDesignationResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${DESIGNATIONS}/{id}/update`,
    summary:
      "Rename a Designation and replace its Permission Template (null or {} removes it)",
    tags: ORGANIZATION,
    params: ConstructionOrganizationDesignationParamsModel,
    body: UpdateConstructionOrganizationDesignationRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated Designation",
    successSchema: ConstructionOrganizationDesignationResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: `${DESIGNATIONS}/{id}/duplicate`,
    summary:
      'Copy a Designation with its Permission Template (name defaults to "<name> (copy)")',
    tags: ORGANIZATION,
    params: ConstructionOrganizationDesignationParamsModel,
    body: DuplicateConstructionOrganizationDesignationRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The copy",
    successSchema: ConstructionOrganizationDesignationResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: `${DESIGNATIONS}/{id}/delete`,
    summary:
      "Delete a Designation (409 DESIGNATION_IN_USE while a Team Member holds it)",
    tags: ORGANIZATION,
    params: ConstructionOrganizationDesignationParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
];

openApiOperations.push(
  {
    method: "get",
    path: "/api/construction/organization/join-requests",
    summary: "Join Requests for the signed-in User's verified mobile or email",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Pending Join Requests",
    successSchema: ListConstructionOrganizationJoinRequestsResponseModel,
    errors: [StatusCodes.UNAUTHORIZED],
  },
  {
    method: "post",
    path: "/api/construction/organization/join-requests/{id}/accept",
    summary: "Accept a Join Request and make that Company active",
    tags: ORGANIZATION,
    params: JoinRequestIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Joined",
    successSchema: AcceptConstructionOrganizationJoinRequestResponseModel,
    errors: [
      StatusCodes.UNAUTHORIZED,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: "/api/construction/organization/join-requests/{id}/reject",
    summary: "Decline a Join Request",
    tags: ORGANIZATION,
    params: JoinRequestIdParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Declined",
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: "/api/construction/organization/join-links/{token}",
    summary: "What an invite link shows before sign-in",
    tags: ORGANIZATION,
    security: false,
    params: JoinLinkTokenParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Company and who the request is for, masked",
    successSchema: GetConstructionOrganizationJoinLinkResponseModel,
    errors: [StatusCodes.BAD_REQUEST, StatusCodes.NOT_FOUND],
  },
);

const TEAM_MEMBERS = "/api/construction/organization/team-members";
const MEMBER_ERRORS = [
  ...SESSION_ERRORS,
  StatusCodes.BAD_REQUEST,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
];

openApiOperations.push(
  {
    method: "get",
    path: TEAM_MEMBERS,
    summary: "Team Members, newest first (organization.team_members read)",
    tags: ORGANIZATION,
    query: ListConstructionOrganizationTeamMembersRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of Team Members",
    successSchema: ListConstructionOrganizationTeamMembersResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.BAD_REQUEST],
  },
  {
    method: "post",
    path: TEAM_MEMBERS,
    summary: "Add a Team Member: Joining Pending, invited by email/SMS",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationTeamMemberRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new Team Member",
    successSchema: ConstructionOrganizationTeamMemberResponseModel,
    errors: [...MEMBER_ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "get",
    path: `${TEAM_MEMBERS}/{id}`,
    summary: "One Team Member",
    tags: ORGANIZATION,
    params: TeamMemberIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Team Member",
    successSchema: ConstructionOrganizationTeamMemberResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: `${TEAM_MEMBERS}/{id}/update`,
    summary: "Edit a Team Member's details and Member Type",
    tags: ORGANIZATION,
    params: TeamMemberIdParamsModel,
    body: UpdateConstructionOrganizationTeamMemberRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Team Member",
    successSchema: ConstructionOrganizationTeamMemberResponseModel,
    errors: [...MEMBER_ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${TEAM_MEMBERS}/{id}/permissions`,
    summary: "Replace a Team Member's Permission Matrix",
    tags: ORGANIZATION,
    params: TeamMemberIdParamsModel,
    body: SetConstructionOrganizationTeamMemberPermissionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Team Member",
    successSchema: ConstructionOrganizationTeamMemberResponseModel,
    errors: MEMBER_ERRORS,
  },
  {
    method: "post",
    path: `${TEAM_MEMBERS}/{id}/projects`,
    summary: "Replace the Projects a Team Member works on",
    tags: ORGANIZATION,
    params: TeamMemberIdParamsModel,
    body: AssignConstructionOrganizationTeamMemberProjectsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Team Member",
    successSchema: ConstructionOrganizationTeamMemberResponseModel,
    errors: MEMBER_ERRORS,
  },
  {
    method: "post",
    path: `${TEAM_MEMBERS}/{id}/resend-invite`,
    summary: "Send a new invite link (also reopens a declined request)",
    tags: ORGANIZATION,
    params: TeamMemberIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Team Member with a new link",
    successSchema: ConstructionOrganizationTeamMemberResponseModel,
    errors: MEMBER_ERRORS,
  },
  {
    method: "post",
    path: `${TEAM_MEMBERS}/{id}/remove`,
    summary: "Remove a Team Member and end their membership",
    tags: ORGANIZATION,
    params: TeamMemberIdParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Removed",
    errors: MEMBER_ERRORS,
  },
  {
    method: "post",
    path: `${TEAM_MEMBERS}/{id}/reveal`,
    summary: "Reveal a Team Member's Aadhaar and PAN (Owner only, logged)",
    tags: ORGANIZATION,
    params: TeamMemberIdParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Full identifiers",
    successSchema: RevealConstructionOrganizationTeamMemberIdsResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
);

openApiOperations.push(
  {
    method: "get",
    path: "/api/construction/organization/settings/backdated-entry",
    summary: "The Company's Back-dated Entry policy",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription:
      "Default limits, the Financial Closing Date and all 24 modules",
    successSchema: GetConstructionOrganizationBackdatedEntryPolicyResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: "/api/construction/organization/settings/backdated-entry/update",
    summary: "Replace the Company's Back-dated Entry policy",
    tags: ORGANIZATION,
    body: UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The saved policy",
    successSchema:
      UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: "/api/construction/organization/settings/sequence-rules",
    summary: "The Company's Sequence ID rules",
    tags: ORGANIZATION,
    query: ListConstructionOrganizationSequenceRulesQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "Live rules, in module order, defaults first",
    successSchema: ListConstructionOrganizationSequenceRulesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "post",
    path: "/api/construction/organization/settings/sequence-rules",
    summary: "Add a Sequence ID rule for a module",
    tags: ORGANIZATION,
    body: CreateConstructionOrganizationSequenceRuleRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The new rule",
    successSchema: CreateConstructionOrganizationSequenceRuleResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: "/api/construction/organization/settings/sequence-rules/{id}/update",
    summary: "Change a Sequence ID rule's number format",
    tags: ORGANIZATION,
    params: ConstructionOrganizationSequenceRuleParamsModel,
    body: UpdateConstructionOrganizationSequenceRuleRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated rule",
    successSchema: UpdateConstructionOrganizationSequenceRuleResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: "/api/construction/organization/settings/sequence-rules/{id}/delete",
    summary: "Delete a Sequence ID rule that never issued a number",
    tags: ORGANIZATION,
    params: ConstructionOrganizationSequenceRuleParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
);

export const openApiDocument = buildOpenApiDocument(
  openApiOperations,
  openApiComponents,
);
