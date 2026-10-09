import { prisma } from "@repo/whiteboard-db";
import {
  renderVerificationCodeEmail,
  renderWorkspaceInvitationEmail,
} from "@repo/email-templates";
import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, organization, username } from "better-auth/plugins";

import { allowedPaths } from "./allowed-paths";
import { createEmailSender, type EmailSender } from "./email/sender";
import { isInvitableRole, accessControl, accessRoles } from "./roles";
import {
  AUTH_BASE_PATH,
  acceptInvitationUrl,
  appOrigin,
  trustedOrigins,
} from "./urls";
import { isInstitutionType } from "./workspace";

/** Sign-up and password reset codes. */
export const OTP_EXPIRES_IN_SECONDS = 10 * 60;
/** Teacher, Student, and Parent invitations. */
export const INVITATION_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

function requiredSecret(): string | undefined {
  const secret = process.env["BETTER_AUTH_SECRET"];
  if (secret != null && secret.length > 0) return secret;
  if (process.env["NODE_ENV"] === "production")
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  // Better Auth falls back to a development-only secret.
  return undefined;
}

function googleProvider(): BetterAuthOptions["socialProviders"] {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return {};
  return { google: { clientId, clientSecret, prompt: "select_account" } };
}

export function inviterDisplayName(user: {
  name?: string | null;
  username?: string | null;
  email: string;
}): string {
  const name = user.name?.trim();
  if (name) return name;
  return user.username ?? user.email;
}

export async function sendInvitationEmail(
  email: EmailSender,
  input: {
    invitationId: string;
    to: string;
    role: string;
    workspaceName: string;
    inviterName: string;
  },
): Promise<void> {
  if (!isInvitableRole(input.role))
    throw new Error(`Cannot send an invitation for role "${input.role}".`);
  const rendered = await renderWorkspaceInvitationEmail({
    workspaceName: input.workspaceName,
    inviterName: input.inviterName,
    role: input.role,
    acceptUrl: acceptInvitationUrl(input.invitationId),
    expiresInDays: INVITATION_EXPIRES_IN_SECONDS / (24 * 60 * 60),
  });
  await email.send({ to: input.to, ...rendered });
}

/**
 * Better Auth options for Whiteboard (ADR-0034). Production and tests build
 * the same options; tests add only the test-utils plugin.
 */
export function createAuthOptions(email: EmailSender = createEmailSender()) {
  return {
    appName: "Whiteboard",
    baseURL: appOrigin(),
    basePath: AUTH_BASE_PATH,
    secret: requiredSecret(),
    trustedOrigins: trustedOrigins(),
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    telemetry: { enabled: false },
    user: { modelName: "identityUser" },
    session: {
      modelName: "identitySession",
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Every request reads the session row, so sign-out, password reset,
      // and revoked sessions take effect immediately.
      cookieCache: { enabled: false },
    },
    account: {
      modelName: "identityAccount",
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
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
    socialProviders: googleProvider(),
    rateLimit: {
      enabled: process.env["AUTH_RATE_LIMIT"] !== "off",
      storage: "database",
      modelName: "identityRateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-in/username": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/email-otp/verify-email": { window: 60, max: 10 },
        "/email-otp/request-password-reset": { window: 60, max: 3 },
        "/email-otp/reset-password": { window: 60, max: 10 },
      },
    },
    plugins: [
      // First: unknown auth paths answer 404 before any other plugin runs.
      allowedPaths(),
      username({ minUsernameLength: 3, maxUsernameLength: 30 }),
      emailOTP({
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        disableSignUp: true,
        otpLength: 6,
        expiresIn: OTP_EXPIRES_IN_SECONDS,
        allowedAttempts: 5,
        storeOTP: "hashed",
        async sendVerificationOTP({ email: to, otp, type }) {
          if (type !== "email-verification" && type !== "forget-password")
            throw new APIError("BAD_REQUEST", {
              message: "This code type is not available.",
            });
          const rendered = await renderVerificationCodeEmail({
            code: otp,
            purpose:
              type === "email-verification" ? "verify-email" : "reset-password",
            expiresInMinutes: OTP_EXPIRES_IN_SECONDS / 60,
          });
          await email.send({ to, ...rendered });
        },
      }),
      organization({
        ac: accessControl,
        roles: accessRoles,
        creatorRole: "owner",
        // Workspace Creation goes through our server action only
        // (`workspaces.create`), which Better Auth treats as a system action.
        allowUserToCreateOrganization: false,
        // Workspace Creation is offered only to a User with no Workspace.
        organizationLimit: 1,
        disableOrganizationDeletion: true,
        invitationExpiresIn: INVITATION_EXPIRES_IN_SECONDS,
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
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
          beforeCreateOrganization({ organization: workspace }) {
            if (!isInstitutionType(workspace["institutionType"]))
              throw new APIError("BAD_REQUEST", {
                message: "Choose an available institution type.",
              });
            return Promise.resolve();
          },
          beforeUpdateOrganization({ organization: changes }) {
            if ("institutionType" in changes)
              throw new APIError("BAD_REQUEST", {
                message: "The institution type cannot be changed.",
              });
            return Promise.resolve();
          },
          beforeCreateInvitation({ invitation }) {
            if (!isInvitableRole(invitation.role))
              throw new APIError("BAD_REQUEST", {
                message: "Invite a Teacher, Student, or Parent.",
              });
            return Promise.resolve();
          },
          beforeAddMember({ member }) {
            // The creator becomes the Owner; everyone else joins by invitation
            // with an invitable role.
            if (member.role !== "owner" && !isInvitableRole(member.role))
              throw new APIError("BAD_REQUEST", {
                message: "Unknown Workspace role.",
              });
            return Promise.resolve();
          },
        },
        async sendInvitationEmail({
          id,
          email: to,
          role,
          organization: ws,
          inviter,
        }) {
          await sendInvitationEmail(email, {
            invitationId: id,
            to,
            role,
            workspaceName: ws.name,
            inviterName: inviterDisplayName(inviter.user),
          });
        },
      }),
      // Must stay last: it sets cookies for auth calls made in server actions.
      nextCookies(),
    ],
  } satisfies BetterAuthOptions;
}
