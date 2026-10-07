import type { RenderedEmail } from "@repo/email-templates";
import { Resend } from "resend";

/** One email to one recipient. */
export type OutgoingEmail = RenderedEmail & { to: string };

export type EmailSender = {
  send(email: OutgoingEmail): Promise<void>;
};

export type EmailTransport = "resend" | "mailpit" | "outbox" | "log";

/** Emails captured by the `outbox` transport, newest last. Tests read this. */
export const outbox: OutgoingEmail[] = [];

function transportFromEnv(): EmailTransport {
  const value = process.env["EMAIL_TRANSPORT"];
  if (
    value === "resend" ||
    value === "mailpit" ||
    value === "outbox" ||
    value === "log"
  )
    return value;
  if (value != null && value.length > 0)
    throw new Error(
      `EMAIL_TRANSPORT must be resend, mailpit, outbox, or log (got "${value}").`,
    );
  return process.env["NODE_ENV"] === "production" ? "resend" : "log";
}

function fromAddress(): string {
  return process.env["EMAIL_FROM"] ?? "Whiteboard <no-reply@localhost>";
}

class ResendSender implements EmailSender {
  private client: Resend | null = null;

  async send(email: OutgoingEmail): Promise<void> {
    const apiKey = process.env["RESEND_API_KEY"];
    if (apiKey == null || apiKey.length === 0)
      throw new Error("RESEND_API_KEY is required to send email with Resend.");
    this.client ??= new Resend(apiKey);
    const { error } = await this.client.emails.send({
      from: fromAddress(),
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error != null)
      throw new Error(`Resend rejected the email: ${error.message}`);
  }
}

/** Mailpit's HTTP send API, for local development and end-to-end tests. */
class MailpitSender implements EmailSender {
  async send(email: OutgoingEmail): Promise<void> {
    const base = process.env["MAILPIT_URL"] ?? "http://localhost:8025";
    const from = fromAddress();
    const match = /^(.*)<(.+)>$/.exec(from);
    const response = await fetch(`${base}/api/v1/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        From: match
          ? { Name: match[1]?.trim() ?? "", Email: match[2]?.trim() ?? from }
          : { Email: from },
        To: [{ Email: email.to }],
        Subject: email.subject,
        HTML: email.html,
        Text: email.text,
      }),
    });
    if (!response.ok)
      throw new Error(`Mailpit rejected the email: ${response.status}`);
  }
}

/** Codes and links must never reach production logs or memory. */
function assertNotProduction(transport: EmailTransport): void {
  if (process.env["NODE_ENV"] === "production")
    throw new Error(
      `EMAIL_TRANSPORT=${transport} is for development and tests only.`,
    );
}

class OutboxSender implements EmailSender {
  send(email: OutgoingEmail): Promise<void> {
    assertNotProduction("outbox");
    outbox.push(email);
    return Promise.resolve();
  }
}

/** Development fallback: print the email so codes and links are usable. */
class LogSender implements EmailSender {
  send(email: OutgoingEmail): Promise<void> {
    assertNotProduction("log");
    // Development only: the code or link must be readable without a mailbox.
    console.warn(
      `[email] to=${email.to} subject="${email.subject}"\n${email.text}`,
    );
    return Promise.resolve();
  }
}

export function createEmailSender(
  transport: EmailTransport = transportFromEnv(),
): EmailSender {
  switch (transport) {
    case "resend":
      return new ResendSender();
    case "mailpit":
      return new MailpitSender();
    case "outbox":
      return new OutboxSender();
    case "log":
      return new LogSender();
  }
}
