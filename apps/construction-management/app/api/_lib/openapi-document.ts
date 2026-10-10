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
import { UpdateConstructionOrganizationCompanyProfileRequestModel } from "@/app/api/construction/organization/company-profile/update/update-company-profile-request-model";
import { GetConstructionOrganizationMyProfileResponseModel } from "@/app/api/construction/organization/me/profile/get-my-profile-response-model";
import { RevealConstructionOrganizationMyIdentifiersResponseModel } from "@/app/api/construction/organization/me/profile/reveal-identifiers/reveal-my-identifiers-response-model";
import { UpdateConstructionOrganizationMyProfileRequestModel } from "@/app/api/construction/organization/me/profile/update/update-my-profile-request-model";
import { IMAGE_CONTENT_TYPES } from "@/src/shared-kernel/files";
import { QuoteConstructionOrganizationCheckoutRequestModel } from "@/app/api/construction/organization/subscription/checkout/quote/quote-checkout-request-model";
import { QuoteConstructionOrganizationCheckoutResponseModel } from "@/app/api/construction/organization/subscription/checkout/quote/quote-checkout-response-model";
import { StartConstructionOrganizationCheckoutRequestModel } from "@/app/api/construction/organization/subscription/checkout/start-checkout-request-model";
import { StartConstructionOrganizationCheckoutResponseModel } from "@/app/api/construction/organization/subscription/checkout/start-checkout-response-model";
import { VerifyConstructionOrganizationCheckoutRequestModel } from "@/app/api/construction/organization/subscription/checkout/verify/verify-checkout-request-model";
import { VerifyConstructionOrganizationCheckoutResponseModel } from "@/app/api/construction/organization/subscription/checkout/verify/verify-checkout-response-model";
import { GetConstructionOrganizationSubscriptionResponseModel } from "@/app/api/construction/organization/subscription/get-subscription-response-model";
import { GetConstructionOrganizationInvoicePdfParamsModel } from "@/app/api/construction/organization/subscription/invoices/[id]/pdf/get-invoice-pdf-params-model";
import { ListConstructionOrganizationInvoicesRequestModel } from "@/app/api/construction/organization/subscription/invoices/list-invoices-request-model";
import { ListConstructionOrganizationInvoicesResponseModel } from "@/app/api/construction/organization/subscription/invoices/list-invoices-response-model";
import { ListConstructionOrganizationPlansResponseModel } from "@/app/api/construction/organization/subscription/plans/list-plans-response-model";
import { ReceiveConstructionOrganizationRazorpayWebhookResponseModel } from "@/app/api/webhooks/razorpay/razorpay-webhook-response-model";
import {
  mastersOpenApiComponents,
  mastersOpenApiOperations,
} from "@/app/api/construction/masters/masters-openapi";
import {
  partiesOpenApiComponents,
  partiesOpenApiOperations,
} from "@/app/api/construction/masters/parties-openapi";
import {
  projectsOpenApiComponents,
  projectsOpenApiOperations,
} from "@/app/api/construction/projects/openapi";
import {
  projectDocumentOpenApiComponents,
  projectDocumentOpenApiOperations,
} from "@/app/api/construction/projects/projects/[id]/documents/project-document-openapi";
import {
  wingOpenApiComponents,
  wingOpenApiOperations,
} from "@/app/api/construction/projects/projects/[id]/wings/wing-openapi";
import {
  locationOpenApiComponents,
  locationOpenApiOperations,
} from "@/app/api/construction/projects/projects/[id]/locations/location-openapi";
import {
  projectResourcesOpenApiComponents,
  projectResourcesOpenApiOperations,
} from "@/app/api/construction/projects/projects/[id]/resources/resources-openapi";
import {
  vendorOpenApiComponents,
  vendorOpenApiOperations,
} from "@/app/api/construction/labour/vendors/vendor-openapi";
import {
  labourOpenApiComponents,
  labourOpenApiOperations,
} from "@/app/api/construction/labour/labours/labour-openapi";
import {
  labourSummaryOpenApiComponents,
  labourSummaryOpenApiOperations,
} from "@/app/api/construction/labour/summary/summary-openapi";
import {
  vendorAttendanceOpenApiComponents,
  vendorAttendanceOpenApiOperations,
} from "@/app/api/construction/labour/attendance/vendors/vendor-attendance-openapi";
import {
  labourAttendanceOpenApiComponents,
  labourAttendanceOpenApiOperations,
} from "@/app/api/construction/labour/attendance/labour/labour-attendance-openapi";
import {
  paymentOpenApiComponents,
  paymentOpenApiOperations,
} from "@/app/api/construction/labour/payments/payment-openapi";
import {
  reportingOpenApiComponents,
  reportingOpenApiOperations,
} from "@/app/api/construction/reporting/reports/report-openapi";
import {
  hrmsOpenApiComponents,
  hrmsOpenApiOperations,
} from "@/app/api/construction/hrms/hrms-openapi";
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
  UpdateConstructionOrganizationCompanyProfileRequestModel,
  GetConstructionOrganizationMyProfileResponseModel,
  UpdateConstructionOrganizationMyProfileRequestModel,
  RevealConstructionOrganizationMyIdentifiersResponseModel,
  GetConstructionOrganizationSubscriptionResponseModel,
  ListConstructionOrganizationPlansResponseModel,
  QuoteConstructionOrganizationCheckoutRequestModel,
  QuoteConstructionOrganizationCheckoutResponseModel,
  StartConstructionOrganizationCheckoutRequestModel,
  StartConstructionOrganizationCheckoutResponseModel,
  VerifyConstructionOrganizationCheckoutRequestModel,
  VerifyConstructionOrganizationCheckoutResponseModel,
  ListConstructionOrganizationInvoicesResponseModel,
  ReceiveConstructionOrganizationRazorpayWebhookResponseModel,
};

const IMAGE_TYPES = [...IMAGE_CONTENT_TYPES];

const UPLOAD_ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
  StatusCodes.CONFLICT,
] as const;

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
    successDescription: "The Company, made the Active Company",
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
    summary: "The Active Company's profile (Settings read)",
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
    summary:
      "Join Requests for the signed-in User's verified email (or mobile while SMS is on)",
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
    summary:
      "Add a Team Member: Joining Pending, invited by email (and SMS while SMS is on)",
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
    summary:
      "Send a new invite link (also reopens a declined request); needs an email while SMS is off",
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

openApiOperations.push(
  {
    method: "post",
    path: "/api/construction/organization/company-profile/update",
    summary:
      "Change the Company's name, contact, GSTIN, PAN, address, currency and time zone (Settings update; the country is fixed)",
    tags: ORGANIZATION,
    body: UpdateConstructionOrganizationCompanyProfileRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated Company profile",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "get",
    path: "/api/construction/organization/company-profile/logo",
    summary: "The Company logo, for the Company's Team Members",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The logo image",
    successBinaryContentTypes: IMAGE_TYPES,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: "/api/construction/organization/company-profile/logo",
    summary:
      "Set or replace the Company logo: the image as the body, PNG, JPEG or WebP, at most 2 MB (Settings update)",
    tags: ORGANIZATION,
    bodyBinaryContentTypes: IMAGE_TYPES,
    successStatus: StatusCodes.OK,
    successDescription: "The Company profile with its new logo",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [...UPLOAD_ERRORS],
  },
  {
    method: "post",
    path: "/api/construction/organization/company-profile/logo/remove",
    summary: "Remove the Company logo (Settings update)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The Company profile without a logo",
    successSchema: GetConstructionOrganizationCompanyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: "/api/construction/organization/me/profile",
    summary: "My Profile: the caller's own Team Member record",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The caller's Team Member record, ids masked",
    successSchema: GetConstructionOrganizationMyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: "/api/construction/organization/me/profile/update",
    summary:
      "Change the caller's own name, email, address, emergency contact, Aadhaar and PAN (and mobile while SMS is off)",
    tags: ORGANIZATION,
    body: UpdateConstructionOrganizationMyProfileRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The updated record",
    successSchema: GetConstructionOrganizationMyProfileResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: "/api/construction/organization/me/profile/reveal-identifiers",
    summary:
      "The caller's own Aadhaar and PAN in full (audited; an OTP step arrives with M9)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "Aadhaar and PAN",
    successSchema: RevealConstructionOrganizationMyIdentifiersResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: "/api/construction/organization/me/photo",
    summary: "The caller's own photo",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The photo image",
    successBinaryContentTypes: IMAGE_TYPES,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: "/api/construction/organization/me/photo",
    summary:
      "Set or replace the caller's photo: the image as the body, PNG, JPEG or WebP, at most 10 MB",
    tags: ORGANIZATION,
    bodyBinaryContentTypes: IMAGE_TYPES,
    successStatus: StatusCodes.OK,
    successDescription: "The caller's record with the new photo",
    successSchema: GetConstructionOrganizationMyProfileResponseModel,
    errors: [...UPLOAD_ERRORS],
  },
  {
    method: "post",
    path: "/api/construction/organization/me/photo/remove",
    summary: "Remove the caller's photo",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The caller's record without a photo",
    successSchema: GetConstructionOrganizationMyProfileResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND, StatusCodes.CONFLICT],
  },
);

openApiOperations.push(
  {
    method: "get",
    path: "/api/construction/organization/subscription",
    summary:
      "Your Subscription: plan, status, expiry and usage (amounts for the Owner only)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription:
      "The Active Company's subscription; `plan` is null and nothing is limited before its first plan",
    successSchema: GetConstructionOrganizationSubscriptionResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "get",
    path: "/api/construction/organization/subscription/plans",
    summary: "Plans and add-ons on sale (Owner only)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The plan catalogue, prices in paise before GST",
    successSchema: ListConstructionOrganizationPlansResponseModel,
    errors: [...SESSION_ERRORS],
  },
  {
    method: "post",
    path: "/api/construction/organization/subscription/checkout/quote",
    summary: "Price a new plan, extension, upgrade or add-ons (Owner only)",
    tags: ORGANIZATION,
    body: QuoteConstructionOrganizationCheckoutRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The Order Summary",
    successSchema: QuoteConstructionOrganizationCheckoutResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: "/api/construction/organization/subscription/checkout",
    summary: "Create a subscription order and its Razorpay order (Owner only)",
    tags: ORGANIZATION,
    body: StartConstructionOrganizationCheckoutRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The order and what Razorpay Checkout opens with",
    successSchema: StartConstructionOrganizationCheckoutResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.SERVICE_UNAVAILABLE,
    ],
  },
  {
    method: "post",
    path: "/api/construction/organization/subscription/checkout/verify",
    summary:
      "Confirm a payment from Razorpay Checkout's signature (Owner only)",
    tags: ORGANIZATION,
    body: VerifyConstructionOrganizationCheckoutRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The order, paid",
    successSchema: VerifyConstructionOrganizationCheckoutResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: "/api/construction/organization/subscription/invoices",
    summary: "Subscription tax invoices, newest first (Owner only)",
    tags: ORGANIZATION,
    query: ListConstructionOrganizationInvoicesRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of invoices",
    successSchema: ListConstructionOrganizationInvoicesResponseModel,
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS],
  },
  {
    method: "get",
    path: "/api/construction/organization/subscription/invoices/{id}/pdf",
    summary: "A subscription tax invoice as PDF (Owner only)",
    tags: ORGANIZATION,
    params: GetConstructionOrganizationInvoicePdfParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The invoice",
    successBinaryContentTypes: ["application/pdf"],
    errors: [StatusCodes.BAD_REQUEST, ...SESSION_ERRORS, StatusCodes.NOT_FOUND],
  },
  {
    method: "post",
    path: "/api/webhooks/razorpay",
    summary:
      "Razorpay webhook: settles paid orders once (signed with X-Razorpay-Signature)",
    tags: ORGANIZATION,
    security: false,
    successStatus: StatusCodes.OK,
    successDescription: "Received; replays are acknowledged and ignored",
    successSchema: ReceiveConstructionOrganizationRazorpayWebhookResponseModel,
    errors: [StatusCodes.UNAUTHORIZED],
  },
);

// The projects context (CM-204) lists its own models and routes.
Object.assign(openApiComponents, projectsOpenApiComponents);
openApiOperations.push(...projectsOpenApiOperations);

// Project documents (CM-414) list their own models and routes.
Object.assign(openApiComponents, projectDocumentOpenApiComponents);
openApiOperations.push(...projectDocumentOpenApiOperations);

// Phases, Wings (CM-402) and Locations (CM-405) list their own models and routes.
Object.assign(openApiComponents, wingOpenApiComponents);
openApiOperations.push(...wingOpenApiOperations);
Object.assign(openApiComponents, locationOpenApiComponents);
openApiOperations.push(...locationOpenApiOperations);

// Project Resources (CM-406): where four contexts' parties meet a Project.
Object.assign(openApiComponents, projectResourcesOpenApiComponents);
openApiOperations.push(...projectResourcesOpenApiOperations);

// The masters context (CM-203) lists its own models and routes.
Object.assign(openApiComponents, mastersOpenApiComponents);
openApiOperations.push(...mastersOpenApiOperations);

// Contractors and Suppliers (CM-406) list their own models and routes.
Object.assign(openApiComponents, partiesOpenApiComponents);
openApiOperations.push(...partiesOpenApiOperations);

// The Vendor register (CM-208, CM-209) lists its own models and routes.
Object.assign(openApiComponents, vendorOpenApiComponents);
openApiOperations.push(...vendorOpenApiOperations);

// The Labour register (CM-205 – CM-207) lists its own models and routes.
Object.assign(openApiComponents, labourOpenApiComponents);
openApiOperations.push(...labourOpenApiOperations);

// The project labour summary (CM-219) lists its own model and route.
Object.assign(openApiComponents, labourSummaryOpenApiComponents);
openApiOperations.push(...labourSummaryOpenApiOperations);

// Vendor attendance (CM-212, CM-213) lists its own models and routes.
Object.assign(openApiComponents, vendorAttendanceOpenApiComponents);
openApiOperations.push(...vendorAttendanceOpenApiOperations);

// Labour attendance (CM-210, CM-211) lists its own models and routes.
Object.assign(openApiComponents, labourAttendanceOpenApiComponents);
openApiOperations.push(...labourAttendanceOpenApiOperations);

// Wage payments and balances (CM-214, CM-215) list their own models and routes.
Object.assign(openApiComponents, paymentOpenApiComponents);
openApiOperations.push(...paymentOpenApiOperations);

// Report jobs (CM-217, CM-218) list their own models and routes.
Object.assign(openApiComponents, reportingOpenApiComponents);
openApiOperations.push(...reportingOpenApiOperations);

// The hrms context (M3) lists its own models and routes.
Object.assign(openApiComponents, hrmsOpenApiComponents);
openApiOperations.push(...hrmsOpenApiOperations);

export const openApiDocument = buildOpenApiDocument(
  openApiOperations,
  openApiComponents,
);
