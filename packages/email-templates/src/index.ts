import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { createElement } from "react";

import {
  VerificationCodeEmail,
  type VerificationCodeEmailProps,
} from "./emails/verification-code";
import {
  WorkspaceInvitationEmail,
  type WorkspaceInvitationEmailProps,
} from "./emails/workspace-invitation";

export {
  VerificationCodeEmail,
  type VerificationCodeEmailProps,
  type VerificationCodePurpose,
} from "./emails/verification-code";
export {
  WorkspaceInvitationEmail,
  type InvitationRole,
  type WorkspaceInvitationEmailProps,
} from "./emails/workspace-invitation";

/** A rendered email, ready for any transport. */
export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

async function renderBoth(element: ReactElement) {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}

export async function renderWorkspaceInvitationEmail(
  props: WorkspaceInvitationEmailProps,
): Promise<RenderedEmail> {
  return {
    subject: `Join ${props.workspaceName} on Whiteboard`,
    ...(await renderBoth(createElement(WorkspaceInvitationEmail, props))),
  };
}

export async function renderVerificationCodeEmail(
  props: VerificationCodeEmailProps,
): Promise<RenderedEmail> {
  return {
    subject:
      props.purpose === "verify-email"
        ? `${props.code} is your Whiteboard verification code`
        : `${props.code} is your Whiteboard password reset code`,
    ...(await renderBoth(createElement(VerificationCodeEmail, props))),
  };
}
