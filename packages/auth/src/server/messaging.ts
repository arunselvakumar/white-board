import type { OutgoingEmail } from "../email/sender";
import { appOrigin } from "../urls";
import { emailSender } from "./auth";

/**
 * Email through the same transport as sign-in codes, for Whiteboard's own
 * notices (Absence Notices to Teachers, ADR-0041). `url` turns an app path
 * into an absolute link for the email.
 */
export const whiteboardMessaging = {
  sendEmail(email: OutgoingEmail): Promise<void> {
    return emailSender.send(email);
  },
  url(path: string): string {
    return `${appOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
  },
};
