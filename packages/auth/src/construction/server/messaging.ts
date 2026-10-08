import type { OutgoingEmail } from "../../email/sender";
import type { OutgoingSms } from "../sms";
import { isConstructionSmsEnabled } from "../features";
import { constructionEmailSender, constructionSmsSender } from "./auth";

/**
 * Email and SMS through the same transports as sign-in codes, for the
 * construction app's own notices (Join Request invitations, CM-109).
 * While SMS is off (ADR CM-0009) texts are dropped and `smsEnabled` is
 * false, so callers can say so.
 */
export const constructionMessaging = {
  sendEmail(email: OutgoingEmail): Promise<void> {
    return constructionEmailSender.send(email);
  },
  get smsEnabled(): boolean {
    return isConstructionSmsEnabled();
  },
  sendSms(sms: OutgoingSms): Promise<void> {
    if (!isConstructionSmsEnabled()) return Promise.resolve();
    return constructionSmsSender.send(sms);
  },
};
