import { constructionMessaging } from "@repo/auth/construction/server";
import { renderTeamInvitationEmail } from "@repo/email-templates";

import type {
  InvitationChannels,
  InvitationMessage,
} from "../application/invitation-notifier";

function text(message: InvitationMessage): string {
  const role =
    message.designationName == null ? "" : ` as ${message.designationName}`;
  return `${message.memberName}, you are invited to join ${message.companyName}${role} on Construction Management. Open ${message.link} and sign in with this number to accept.`;
}

/** Invitation email (React Email, CM-119) and SMS. */
export const invitationChannels: InvitationChannels = {
  email: async (to, message) => {
    const rendered = await renderTeamInvitationEmail({
      companyName: message.companyName,
      memberName: message.memberName,
      designationName: message.designationName,
      joinUrl: message.link,
    });
    await constructionMessaging.sendEmail({ to, ...rendered });
  },
  sms: (to, message) =>
    constructionMessaging.sendSms({
      to,
      text: text(message),
      link: message.link,
    }),
};
