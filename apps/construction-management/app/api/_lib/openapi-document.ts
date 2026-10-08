import { StatusCodes } from "http-status-codes";

import { SwitchConstructionOrganizationCompanyParamsModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-params-model";
import { SwitchConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/[id]/switch/switch-company-response-model";
import { CreateConstructionOrganizationCompanyRequestModel } from "@/app/api/construction/organization/companies/create-company-request-model";
import { CreateConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/create-company-response-model";
import { ListMyConstructionOrganizationCompaniesResponseModel } from "@/app/api/construction/organization/companies/me/list-my-companies-response-model";
import { GetConstructionOrganizationCompanyProfileResponseModel } from "@/app/api/construction/organization/company-profile/get-company-profile-response-model";
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
    path: "/api/construction/organization/subscription",
    summary:
      "Your Subscription: plan, status, expiry and usage (amounts for the Owner only)",
    tags: ORGANIZATION,
    successStatus: StatusCodes.OK,
    successDescription: "The Active Company's subscription",
    successSchema: GetConstructionOrganizationSubscriptionResponseModel,
    errors: [...SESSION_ERRORS, StatusCodes.NOT_FOUND],
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
];

export const openApiDocument = buildOpenApiDocument(
  openApiOperations,
  openApiComponents,
);
