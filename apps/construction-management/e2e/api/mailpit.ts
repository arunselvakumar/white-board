import { expect } from "@playwright/test";

import { e2eEnv } from "../../playwright.config";

const MAILPIT = e2eEnv["MAILPIT_URL"] ?? "http://localhost:8025";

export type Email = {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
};

type SearchResult = { messages: { ID: string; Subject: string }[] };

/**
 * The newest email Mailpit caught for `to` (whose subject matches, when
 * given), waiting up to 15 s for it to arrive.
 */
export async function latestEmailTo(
  to: string,
  subject?: RegExp,
): Promise<Email> {
  let found: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const { messages } = (await response.json()) as SearchResult;
        found = messages.find(
          (message) => subject == null || subject.test(message.Subject),
        )?.ID;
        return found;
      },
      { message: `an email to ${to}`, timeout: 15_000 },
    )
    .toBeTruthy();
  const response = await fetch(`${MAILPIT}/api/v1/message/${found ?? ""}`);
  return (await response.json()) as Email;
}

/** The 6-digit code in the newest code email of `kind` to `to`. */
export async function emailCodeFor(
  to: string,
  kind: "verification" | "password reset" | "confirmation" = "verification",
): Promise<string> {
  const email = await latestEmailTo(to, new RegExp(`is your .* ${kind} code`));
  const code = /^(\d{6}) /.exec(email.Subject)?.[1];
  if (code == null) throw new Error(`No code in the email to ${to}.`);
  return code;
}

/** The first link in the newest email to `to` whose path starts with `pathPrefix`. */
export async function emailLinkFor(
  to: string,
  pathPrefix: string,
  subject?: RegExp,
): Promise<string> {
  const email = await latestEmailTo(to, subject);
  const link = [...email.Text.matchAll(/https?:\/\/[^\s)>\]"]+/g)]
    .map((match) => new URL(match[0]))
    .find((url) => url.pathname.startsWith(pathPrefix));
  if (link == null)
    throw new Error(`No ${pathPrefix} link in the email to ${to}.`);
  return `${link.pathname}${link.search}`;
}
