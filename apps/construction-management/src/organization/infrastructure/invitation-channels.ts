import { constructionMessaging } from "@repo/auth/construction/server";

import type {
  InvitationChannels,
  InvitationMessage,
} from "../application/invitation-notifier";

function text(message: InvitationMessage): string {
  const role =
    message.designationName == null ? "" : ` as ${message.designationName}`;
  return `${message.memberName}, you are invited to join ${message.companyName}${role} on Construction Management. Open ${message.link} and sign in with this number or email to accept.`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Plain invitation notices; React Email templates replace them in CM-119. */
export const invitationChannels: InvitationChannels = {
  email: (to, message) =>
    constructionMessaging.sendEmail({
      to,
      subject: `Join ${message.companyName} on Construction Management`,
      text: text(message),
      html: `<p>${escapeHtml(text(message))}</p><p><a href="${escapeHtml(message.link)}">Accept the invitation</a></p>`,
    }),
  sms: (to, message) =>
    constructionMessaging.sendSms({
      to,
      text: text(message),
      link: message.link,
    }),
};
