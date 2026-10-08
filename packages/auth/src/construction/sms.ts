import { isLiveProduction } from "../runtime";

/** One text message to one mobile (E.164). */
export type OutgoingSms = {
  to: string;
  text: string;
  /** The OTP, when the message carries one; MSG91 sends it into a template. */
  code?: string;
  /** The link an invitation carries; MSG91 sends it into the invite template. */
  link?: string;
};

export type SmsSender = {
  send(sms: OutgoingSms): Promise<void>;
};

export type SmsTransport = "msg91" | "log" | "outbox";

/** Messages captured by the `outbox` transport, newest last. Tests read this. */
export const smsOutbox: OutgoingSms[] = [];

function transportFromEnv(): SmsTransport {
  const value = process.env["SMS_TRANSPORT"];
  if (value === "msg91" || value === "log" || value === "outbox") return value;
  if (value != null && value.length > 0)
    throw new Error(
      `SMS_TRANSPORT must be msg91, log, or outbox (got "${value}").`,
    );
  return process.env["NODE_ENV"] === "production" ? "msg91" : "log";
}

function assertNotProduction(transport: SmsTransport): void {
  if (isLiveProduction())
    throw new Error(
      `SMS_TRANSPORT=${transport} is for development and tests only.`,
    );
}

/**
 * MSG91's Flow API. Codes use the OTP template (`##otp##`); other notices
 * (invitations) use `MSG91_INVITE_TEMPLATE_ID` with `##link##`, and are
 * skipped until that DLT-approved template exists.
 */
class Msg91Sender implements SmsSender {
  async send(sms: OutgoingSms): Promise<void> {
    const authKey = process.env["MSG91_AUTH_KEY"];
    const templateId =
      sms.code == null
        ? process.env["MSG91_INVITE_TEMPLATE_ID"]
        : process.env["MSG91_TEMPLATE_ID"];
    if (sms.code == null && !templateId) {
      console.warn(`[sms] no invite template; not texting ${sms.to}`);
      return;
    }
    if (!authKey || !templateId)
      throw new Error("MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required.");
    const response = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: authKey, "content-type": "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        recipients: [
          {
            mobiles: sms.to.replace(/^\+/, ""),
            ...(sms.code == null ? { link: sms.link } : { otp: sms.code }),
          },
        ],
      }),
    });
    if (!response.ok)
      throw new Error(`MSG91 rejected the message: ${response.status}`);
  }
}

class LogSender implements SmsSender {
  send(sms: OutgoingSms): Promise<void> {
    assertNotProduction("log");
    // Development only: the code must be readable without a phone.
    console.warn(`[sms] to=${sms.to}\n${sms.text}`);
    return Promise.resolve();
  }
}

class OutboxSender implements SmsSender {
  send(sms: OutgoingSms): Promise<void> {
    assertNotProduction("outbox");
    smsOutbox.push(sms);
    return Promise.resolve();
  }
}

export function createSmsSender(
  transport: SmsTransport = transportFromEnv(),
): SmsSender {
  switch (transport) {
    case "msg91":
      return new Msg91Sender();
    case "log":
      return new LogSender();
    case "outbox":
      return new OutboxSender();
  }
}
