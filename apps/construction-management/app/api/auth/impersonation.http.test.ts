import { randomUUID } from "node:crypto";

import { getCompanyAuthFromHeaders } from "@repo/auth/construction/server";
import { outbox } from "@repo/auth/construction/testing";
import { prisma } from "@repo/construction-db";
import { beforeEach, describe, expect, it } from "vitest";

import {
  TEST_ORIGIN,
  TEST_OTP,
  lastEmailCodeFor,
  newEmail,
  signInByEmail,
} from "@/test/sessions";

import { POST } from "./[...all]/route";

function authPost(path: string, body: unknown): Promise<Response> {
  return POST(
    new Request(`${TEST_ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: TEST_ORIGIN },
      body: JSON.stringify(body),
    }),
  );
}

function newAdminEmail(): string {
  return `staff-${randomUUID().slice(0, 12)}@white-board.io`;
}

function sendCode(customerEmail: string, adminEmail: string) {
  return authPost("/impersonation/send-code", { customerEmail, adminEmail });
}

function verify(customerEmail: string, adminEmail: string, code: string) {
  return authPost("/impersonation/verify", {
    customerEmail,
    adminEmail,
    code,
  });
}

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

async function errorCode(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { code?: string }).code;
}

/** A code that is not `code`, for wrong-code tries. */
function wrongCodeFor(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

describe("sign in as a customer (ADR CM-0029)", () => {
  beforeEach(() => {
    outbox.length = 0;
  });

  it("emails the admin a code that signs this browser in as the customer", async () => {
    const customer = await signInByEmail();
    const admin = newAdminEmail();

    const toCustomer = () =>
      outbox.filter((mail) => mail.to === customer.email).length;
    const customerMailBefore = toCustomer();

    const sent = await sendCode(customer.email, admin);
    expect(sent.status).toBe(200);
    // The customer is not emailed.
    expect(toCustomer()).toBe(customerMailBefore);
    const mail = outbox.find((m) => m.to === admin);
    expect(mail?.text).toContain(`sign in as ${customer.email}`);

    const verified = await verify(
      customer.email,
      admin,
      lastEmailCodeFor(admin),
    );
    expect(verified.status).toBe(200);
    await expect(verified.json()).resolves.toEqual({
      userId: customer.userId,
    });

    const auth = await getCompanyAuthFromHeaders(
      new Headers({ cookie: cookieOf(verified) }),
    );
    expect(auth.userId).toBe(customer.userId);
    expect(auth.impersonatedBy).toBe(admin);

    const session = await prisma.identitySession.findUniqueOrThrow({
      where: { id: auth.sessionId ?? "" },
    });
    expect(session.impersonatedBy).toBe(admin);
    // A normal 30-day Session, as the owner chose.
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      29 * 24 * 60 * 60 * 1000,
    );

    const records = await prisma.identityImpersonation.findMany({
      where: { adminEmail: admin },
    });
    expect(records).toEqual([
      expect.objectContaining({
        userId: customer.userId,
        customerEmail: customer.email,
        sessionId: session.id,
      }),
    ]);
  });

  it("leaves the customer's own Sessions without impersonatedBy", async () => {
    const customer = await signInByEmail();
    const auth = await getCompanyAuthFromHeaders(
      new Headers({ cookie: customer.cookie }),
    );
    expect(auth.impersonatedBy).toBeNull();
  });

  it("accepts the admin email in any case", async () => {
    const customer = await signInByEmail();
    const admin = newAdminEmail();
    const sent = await sendCode(
      customer.email.toUpperCase(),
      admin.toUpperCase(),
    );
    expect(sent.status).toBe(200);
    const verified = await verify(
      customer.email,
      admin,
      lastEmailCodeFor(admin),
    );
    expect(verified.status).toBe(200);
  });

  it.each([
    "staff@example.com",
    "staff@mail.white-board.io",
    "staff@white-board.io.example.com",
    "staff@whiteboard.io",
    "white-board.io",
  ])("refuses %s as the admin email and sends nothing", async (admin) => {
    const sent = await sendCode(newEmail(), admin);
    expect(sent.status).toBe(400);
    expect(outbox).toHaveLength(0);
  });

  it("refuses a wrong code, then locks the code after five tries", async () => {
    const customer = await signInByEmail();
    const admin = newAdminEmail();
    await sendCode(customer.email, admin);
    const code = lastEmailCodeFor(admin);
    const wrong = wrongCodeFor(code);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const refused = await verify(customer.email, admin, wrong);
      expect(refused.status).toBe(400);
      await expect(errorCode(refused)).resolves.toBe("INVALID_OTP");
    }
    const locked = await verify(customer.email, admin, code);
    expect(locked.status).toBe(403);
    await expect(errorCode(locked)).resolves.toBe("TOO_MANY_ATTEMPTS");
    const after = await verify(customer.email, admin, code);
    await expect(errorCode(after)).resolves.toBe("OTP_NOT_FOUND");
  });

  it("works once", async () => {
    const customer = await signInByEmail();
    const admin = newAdminEmail();
    await sendCode(customer.email, admin);
    const code = lastEmailCodeFor(admin);
    expect((await verify(customer.email, admin, code)).status).toBe(200);
    const again = await verify(customer.email, admin, code);
    expect(again.status).toBe(400);
    await expect(errorCode(again)).resolves.toBe("OTP_NOT_FOUND");
  });

  it("only opens the customer the code was sent for", async () => {
    const customer = await signInByEmail();
    const other = await signInByEmail();
    const admin = newAdminEmail();
    await sendCode(customer.email, admin);

    const refused = await verify(other.email, admin, lastEmailCodeFor(admin));
    expect(refused.status).toBe(400);
    await expect(errorCode(refused)).resolves.toBe("OTP_NOT_FOUND");
    await expect(
      prisma.identitySession.count({ where: { impersonatedBy: admin } }),
    ).resolves.toBe(0);
  });

  it("never accepts OTP_TEST_CODE", async () => {
    const customer = await signInByEmail();
    const admin = newAdminEmail();
    await sendCode(customer.email, admin);
    const code = lastEmailCodeFor(admin);
    if (code === TEST_OTP) return;
    const refused = await verify(customer.email, admin, TEST_OTP);
    expect(refused.status).toBe(400);
    await expect(errorCode(refused)).resolves.toBe("INVALID_OTP");
  });

  it("sends a code for an unknown customer, and says so only after the code", async () => {
    const unknown = newEmail();
    const admin = newAdminEmail();
    const sent = await sendCode(unknown, admin);
    expect(sent.status).toBe(200);

    const verified = await verify(unknown, admin, lastEmailCodeFor(admin));
    expect(verified.status).toBe(404);
    await expect(errorCode(verified)).resolves.toBe(
      "IMPERSONATION_USER_NOT_FOUND",
    );
    expect(verified.headers.getSetCookie()).toHaveLength(0);
    await expect(
      prisma.identityImpersonation.count({ where: { adminEmail: admin } }),
    ).resolves.toBe(0);
  });

  it("replaces the last code when a new one is sent", async () => {
    const customer = await signInByEmail();
    const admin = newAdminEmail();
    await sendCode(customer.email, admin);
    const first = lastEmailCodeFor(admin);
    await sendCode(customer.email, admin);
    const second = lastEmailCodeFor(admin);
    if (first !== second) {
      const stale = await verify(customer.email, admin, first);
      await expect(errorCode(stale)).resolves.toBe("INVALID_OTP");
    }
    expect((await verify(customer.email, admin, second)).status).toBe(200);
  });

  it("sends one admin email at most five codes per 15 minutes", async () => {
    const admin = newAdminEmail();
    for (let send = 0; send < 5; send += 1)
      expect((await sendCode(newEmail(), admin)).status).toBe(200);
    const limited = await sendCode(newEmail(), admin);
    expect(limited.status).toBe(429);
    await expect(errorCode(limited)).resolves.toBe("TOO_MANY_CODES");
  });
});
