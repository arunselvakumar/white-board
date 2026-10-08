import { prisma } from "@repo/db";
import { renderCompanyCodeEmail } from "@repo/email-templates";
import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, organization } from "better-auth/plugins";

import { allowedPaths } from "../allowed-paths";
import { createEmailSender, type EmailSender } from "../email/sender";
import { AUTH_BASE_PATH, appOrigin, trustedOrigins } from "../urls";
import {
  CONSTRUCTION_COOKIE_PREFIX,
  CONSTRUCTION_LOCAL_ORIGIN,
} from "./constants";
import { isConstructionSmsEnabled } from "./features";
import { mobileOtp, perMobileOtpLimit } from "./mobile-otp";
import { createSmsSender, type SmsSender } from "./sms";
import {
  COMPANY_WORKSPACE_KIND,
  companyAccessControl,
  companyAccessRoles,
  parseCompanyRole,
} from "./roles";

/** Email verification and password reset codes. */
export const COMPANY_EMAIL_OTP_EXPIRES_IN_SECONDS = 10 * 60;

/** How many Companies one User may own or join. */
export const COMPANY_LIMIT_PER_USER = 50;

/**
 * The auth API paths the construction app uses. Every other Better Auth
 * endpoint answers 404 over HTTP.
 */
export const CONSTRUCTION_AUTH_PATHS: readonly string[] = [
  "/ok",
  "/error",
  "/get-session",
  "/sign-out",
  "/sign-up/email",
  "/sign-in/email",
  "/update-user",
  "/email-otp/send-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
  "/organization/list",
  "/organization/set-active",
  "/organization/get-active-member",
];

/** Mobile OTP sign-in; reachable only while SMS is on (ADR CM-0009). */
export const MOBILE_OTP_AUTH_PATHS: readonly string[] = [
  "/phone-number/send-otp",
  "/phone-number/verify",
];

/** The auth API paths reachable right now. */
export function constructionAuthPaths(): readonly string[] {
  return isConstructionSmsEnabled()
    ? [...CONSTRUCTION_AUTH_PATHS, ...MOBILE_OTP_AUTH_PATHS]
    : CONSTRUCTION_AUTH_PATHS;
}

/**
 * The origin links (invites, sign-in callbacks) point at. A preview uses its
 * own branch URL rather than the production domain.
 */
export function constructionOrigin(): string {
  const configured = process.env["BETTER_AUTH_URL"];
  const branch = process.env["VERCEL_BRANCH_URL"];
  if (
    (configured == null || configured.length === 0) &&
    process.env["VERCEL_ENV"] === "preview" &&
    branch != null &&
    branch.length > 0
  )
    return `https://${branch}`;
  return appOrigin(CONSTRUCTION_LOCAL_ORIGIN);
}

function requiredSecret(): string | undefined {
  const secret = process.env["BETTER_AUTH_SECRET"];
  if (secret != null && secret.length > 0) return secret;
  if (process.env["NODE_ENV"] === "production")
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  return undefined;
}

/**
 * Better Auth options for Construction Management (ADR CM-0001, CM-0002).
 * Same identity tables as Whiteboard; a Company is a Workspace whose
 * `institutionType` is `construction_company`.
 */
export function createConstructionAuthOptions(
  email: EmailSender = createEmailSender(),
  sms: SmsSender = createSmsSender(),
) {
  return {
    appName: "Construction Management",
    baseURL: constructionOrigin(),
    basePath: AUTH_BASE_PATH,
    secret: requiredSecret(),
    trustedOrigins: trustedOrigins(CONSTRUCTION_LOCAL_ORIGIN),
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    telemetry: { enabled: false },
    advanced: { cookiePrefix: CONSTRUCTION_COOKIE_PREFIX },
    user: { modelName: "identityUser" },
    session: {
      modelName: "identitySession",
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: { modelName: "identityAccount" },
    verification: { modelName: "identityVerification" },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignIn: false,
    },
    rateLimit: {
      enabled: process.env["AUTH_RATE_LIMIT"] !== "off",
      storage: "database",
      modelName: "identityRateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/email-otp/verify-email": { window: 60, max: 10 },
        "/email-otp/request-password-reset": { window: 60, max: 3 },
        "/email-otp/reset-password": { window: 60, max: 10 },
        "/phone-number/send-otp": { window: 60, max: 5 },
        "/phone-number/verify": { window: 60, max: 10 },
      },
    },
    plugins: [
      // The phone-number plugin stays registered (stable types); its paths
      // answer 404 while SMS is off.
      allowedPaths("construction-allowed-paths", constructionAuthPaths),
      perMobileOtpLimit(),
      mobileOtp(sms),
      emailOTP({
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        disableSignUp: true,
        otpLength: 6,
        expiresIn: COMPANY_EMAIL_OTP_EXPIRES_IN_SECONDS,
        allowedAttempts: 5,
        storeOTP: "hashed",
        async sendVerificationOTP({ email: to, otp, type }) {
          if (type !== "email-verification" && type !== "forget-password")
            throw new APIError("BAD_REQUEST", {
              message: "This code type is not available.",
            });
          const rendered = await renderCompanyCodeEmail({
            code: otp,
            purpose:
              type === "email-verification" ? "verify-email" : "reset-password",
            expiresInMinutes: COMPANY_EMAIL_OTP_EXPIRES_IN_SECONDS / 60,
          });
          await email.send({ to, ...rendered });
        },
      }),
      organization({
        ac: companyAccessControl,
        roles: companyAccessRoles,
        creatorRole: "owner",
        // Company creation goes through the construction app's own command.
        allowUserToCreateOrganization: false,
        organizationLimit: COMPANY_LIMIT_PER_USER,
        disableOrganizationDeletion: true,
        schema: {
          organization: {
            modelName: "identityWorkspace",
            additionalFields: {
              institutionType: {
                type: "string",
                required: true,
                input: true,
              },
            },
          },
          member: { modelName: "identityWorkspaceMember" },
          invitation: { modelName: "identityWorkspaceInvitation" },
        },
        organizationHooks: {
          beforeCreateOrganization({ organization: company }) {
            if (company["institutionType"] !== COMPANY_WORKSPACE_KIND)
              throw new APIError("BAD_REQUEST", {
                message: "Only a Company can be created here.",
              });
            return Promise.resolve();
          },
          beforeAddMember({ member }) {
            if (parseCompanyRole(member.role) == null)
              throw new APIError("BAD_REQUEST", {
                message: "Unknown Company role.",
              });
            return Promise.resolve();
          },
        },
      }),
      nextCookies(),
    ],
  } satisfies BetterAuthOptions;
}
