import type { OutgoingEmail } from "../../email/sender";
import type { OutgoingSms } from "../sms";
import { constructionEmailSender, constructionSmsSender } from "./auth";

/**
 * Email and SMS through the same transports as sign-in codes, for the
 * construction app's own notices (Join Request invitations, CM-109).
 */
export const constructionMessaging = {
  sendEmail(email: OutgoingEmail): Promise<void> {
    return constructionEmailSender.send(email);
  },
  sendSms(sms: OutgoingSms): Promise<void> {
    return constructionSmsSender.send(sms);
  },
};
