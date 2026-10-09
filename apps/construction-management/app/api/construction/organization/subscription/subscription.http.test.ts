import { randomUUID } from "node:crypto";

import { getCompanyAuthFromHeaders } from "@repo/auth/construction/server";
import { companyAuthStateFor } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { requireAccess } from "@/app/api/_lib/require-access";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { POST as webhook } from "@/app/api/webhooks/razorpay/route";
import { PaymentsNotConfiguredError } from "@/src/organization/application/subscription-handlers";
import { addMonths } from "@/src/organization/domain/subscription";
import { createCompanyHandlers } from "@/src/organization/infrastructure/create-company-handlers";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";
import { createSubscriptionHandlers } from "@/src/organization/infrastructure/create-subscription-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import { FakePaymentGateway } from "@/src/organization/infrastructure/fake-payment-gateway";
import { razorpaySignature } from "@/src/organization/infrastructure/razorpay";
import { givePlan } from "@/test/companies";

import { mapError } from "../../../_lib/map-error";
import { POST as startCheckout } from "./checkout/route";
import { POST as quoteCheckout } from "./checkout/quote/route";
import { POST as verifyCheckout } from "./checkout/verify/route";
import { GET as invoicePdf } from "./invoices/[id]/pdf/route";
import { GET as listInvoices } from "./invoices/route";
import { GET as listPlans } from "./plans/route";
import { GET as getSubscription } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

// Checkout talks to a fake Razorpay; webhooks are signed with the test
// secret from vitest.config.ts.
vi.mock(
  import("@/src/organization/infrastructure/payment-gateway-from-env"),
  async (importOriginal) => {
    const { FakePaymentGateway: Fake } =
      await import("@/src/organization/infrastructure/fake-payment-gateway");
    const gateway = new Fake();
    return {
      ...(await importOriginal()),
      paymentGatewayFromEnv: () => gateway,
    };
  },
);

const WEBHOOK_SECRET = "http-tests-only-razorpay-webhook-secret";
const BASE = "http://localhost/api/construction/organization/subscription";
const mockedAuth = vi.mocked(getCompanyAuthFromHeaders);

function signIn(
  userId: string,
  workspaceId: string,
  role: "owner" | "member" = "owner",
) {
  mockedAuth.mockResolvedValue(
    companyAuthStateFor({ userId, workspaceId, role }),
  );
}

const post = (path: string, body: unknown) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function newCompany() {
  const userId = randomUUID();
  await prisma.identityUser.create({
    data: {
      id: userId,
      name: "Arun Selva Kumar",
      email: `${userId}@example.test`,
    },
  });
  const { workspaceId } = await createCompanyHandlers().create.execute({
    name: "Anugraha Engineers",
    country: "IN",
    userId,
    userName: "Arun Selva Kumar",
    userMobile: null,
    userEmail: `${userId}@example.test`,
  });
  const designations = await createDesignationHandlers().list(workspaceId);
  const designationId =
    designations.find((item) => item.name === "Site Engineer")?.id ?? "";
  return { workspaceId, userId, designationId };
}

const BILLING = {
  name: "Anugraha Engineers",
  address: "Plot 4, Vadasery, Nagercoil",
  stateCode: "33",
  gstin: "33AAPFA0939F1ZM",
};

function signedWebhook(body: unknown, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": razorpaySignature(raw, secret),
    },
    body: raw,
  });
}

function captured(orderId: string, paymentId: string, amount: number) {
  return {
    entity: "event",
    event: "payment.captured",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount,
          currency: "INR",
          status: "captured",
        },
      },
    },
  };
}

type Overview = {
  status: string;
  plan: { name: string; daysLeft: number; endsAt: string } | null;
  usage: { grant: string; used: number; limit: number | null }[];
  addOns: { grant: string; quantity: number }[];
  owner: { paymentsConfigured: boolean; lastBillingAddress: unknown } | null;
};

describe("Your Subscription (CM-116)", () => {
  it("is 401 without a Session", async () => {
    mockedAuth.mockResolvedValue(
      companyAuthStateFor({ userId: null, workspaceId: null }),
    );
    expect((await getSubscription(new Request(BASE))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("shows no plan and unlimited usage for a new Company, amounts to the Owner only", async () => {
    const { workspaceId, userId } = await newCompany();
    signIn(userId, workspaceId);
    const response = await getSubscription(new Request(BASE));
    expect(response.status).toBe(StatusCodes.OK);
    const owner = await json<Overview>(response);
    expect(owner).toMatchObject({
      status: "none",
      plan: null,
      addOns: [],
      owner: { paymentsConfigured: true, lastBillingAddress: null },
    });
    expect(owner.usage).toEqual([
      { grant: "project", used: 0, limit: null },
      { grant: "team_member", used: 1, limit: null },
      { grant: "hrms_member", used: 0, limit: null },
      { grant: "storage_gb", used: 0, limit: null },
    ]);

    signIn("a-member", workspaceId, "member");
    const member = await json<Overview>(
      await getSubscription(new Request(BASE)),
    );
    expect(member.owner).toBeNull();
    expect(member.usage).toEqual(owner.usage);
  });

  it("shows the plan, days left and limits once there is one", async () => {
    const { workspaceId, userId } = await newCompany();
    await givePlan(workspaceId);
    signIn(userId, workspaceId);
    const view = await json<Overview>(await getSubscription(new Request(BASE)));
    expect(view).toMatchObject({
      status: "active",
      plan: { name: "Basic" },
    });
    expect(view.plan?.daysLeft).toBeGreaterThan(150);
    expect(view.usage).toEqual([
      { grant: "project", used: 0, limit: 10 },
      { grant: "team_member", used: 1, limit: 5 },
      { grant: "hrms_member", used: 0, limit: 10 },
      { grant: "storage_gb", used: 0, limit: 20 },
    ]);
  });

  it("lists plans for the Owner only", async () => {
    const { workspaceId, userId } = await newCompany();
    signIn("a-member", workspaceId, "member");
    expect((await listPlans(new Request(`${BASE}/plans`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    signIn(userId, workspaceId);
    const plans = await json<{
      plans: { code: string }[];
      gstRatePercent: number;
    }>(await listPlans(new Request(`${BASE}/plans`)));
    expect(plans.plans.map((plan) => plan.code)).toEqual(["basic"]);
    expect(plans.gstRatePercent).toBe(18);
  });
});

describe("Checkout and Razorpay (CM-117)", () => {
  it("is the Owner's alone", async () => {
    const { workspaceId } = await newCompany();
    signIn("a-member", workspaceId, "member");
    const response = await startCheckout(
      post("/checkout", {
        kind: "new",
        planCode: "basic",
        months: 6,
        billingAddress: BILLING,
      }),
    );
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("refuses to start without Razorpay keys", async () => {
    const { workspaceId, userId } = await newCompany();
    await expect(
      createSubscriptionHandlers({ gateway: null }).checkout({
        workspaceId,
        by: userId,
        choice: { kind: "new", planCode: "basic", months: 6 },
        billing: BILLING,
      }),
    ).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
  });

  it("quotes, orders, and activates once from the signed webhook", async () => {
    const { workspaceId, userId } = await newCompany();
    signIn(userId, workspaceId);

    const quote = await quoteCheckout(
      post("/checkout/quote", {
        kind: "new",
        planCode: "basic",
        months: 6,
        addOns: { team_member: 2 },
        stateCode: "29",
      }),
    );
    expect(quote.status).toBe(StatusCodes.OK);
    expect(await json(quote)).toMatchObject({
      subTotalPaise: 1_758_800,
      igstPaise: 316_584,
      cgstPaise: 0,
      totalPaise: 2_075_384,
    });

    const invalid = await startCheckout(
      post("/checkout", {
        kind: "new",
        planCode: "basic",
        months: 6,
        billingAddress: { ...BILLING, stateCode: "29" },
      }),
    );
    expect(invalid.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(invalid)).toMatchObject({ code: "GSTIN_STATE_MISMATCH" });

    const started = await startCheckout(
      post("/checkout", {
        kind: "new",
        planCode: "basic",
        months: 6,
        addOns: { team_member: 2 },
        billingAddress: BILLING,
      }),
    );
    expect(started.status).toBe(StatusCodes.CREATED);
    const order = await json<{
      orderId: string;
      quote: { totalPaise: number; cgstPaise: number; sgstPaise: number };
      razorpay: { orderId: string; amountPaise: number; keyId: string };
    }>(started);
    expect(order.quote).toMatchObject({
      cgstPaise: 158_292,
      sgstPaise: 158_292,
    });
    expect(order.razorpay).toMatchObject({
      keyId: "rzp_test_fake",
      amountPaise: order.quote.totalPaise,
    });

    // A forged or unsigned webhook changes nothing.
    const forged = await webhook(
      signedWebhook(
        captured(order.razorpay.orderId, "pay_1", order.quote.totalPaise),
        "wrong-secret",
      ),
    );
    expect(forged.status).toBe(StatusCodes.UNAUTHORIZED);
    expect(await json(forged)).toMatchObject({
      code: "WEBHOOK_SIGNATURE_INVALID",
    });
    const unsigned = await webhook(
      new Request("http://localhost/api/webhooks/razorpay", {
        method: "POST",
        body: JSON.stringify(captured(order.razorpay.orderId, "pay_1", 1)),
      }),
    );
    expect(unsigned.status).toBe(StatusCodes.UNAUTHORIZED);

    const event = captured(
      order.razorpay.orderId,
      "pay_1",
      order.quote.totalPaise,
    );
    const first = await webhook(signedWebhook(event));
    expect(first.status).toBe(StatusCodes.OK);
    expect(await json(first)).toEqual({ received: true, result: "paid" });
    const activated = await json<Overview>(
      await getSubscription(new Request(BASE)),
    );
    expect(activated).toMatchObject({
      status: "active",
      plan: { name: "Basic" },
      addOns: [{ grant: "team_member", quantity: 2 }],
    });
    expect(activated.usage[1]).toEqual({
      grant: "team_member",
      used: 1,
      limit: 7,
    });

    // Replays (and order.paid for the same order) do not extend twice.
    const replay = await webhook(signedWebhook(event));
    expect(await json(replay)).toEqual({
      received: true,
      result: "already_paid",
    });
    const orderPaid = await webhook(
      signedWebhook({
        event: "order.paid",
        payload: {
          order: { entity: { id: order.razorpay.orderId } },
          payment: {
            entity: {
              id: "pay_1",
              order_id: order.razorpay.orderId,
              amount: order.quote.totalPaise,
            },
          },
        },
      }),
    );
    expect(await json(orderPaid)).toEqual({
      received: true,
      result: "already_paid",
    });
    const after = await json<Overview>(
      await getSubscription(new Request(BASE)),
    );
    expect(after.plan?.endsAt).toBe(activated.plan?.endsAt);

    const invoices = await json<{
      items: {
        id: string;
        invoiceNumber: string;
        totalPaise: number;
        pdfPath: string;
      }[];
      total: number;
    }>(await listInvoices(new Request(`${BASE}/invoices`)));
    expect(invoices.total).toBe(1);
    expect(invoices.items[0]).toMatchObject({
      totalPaise: order.quote.totalPaise,
    });
    expect(invoices.items[0]?.invoiceNumber).toMatch(
      /^CM\/\d{2}-\d{2}\/\d{5}$/,
    );

    const pdf = await invoicePdf(new Request(`${BASE}/invoices/x/pdf`), {
      params: Promise.resolve({ id: invoices.items[0]?.id ?? "" }),
    });
    expect(pdf.status).toBe(StatusCodes.OK);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

    signIn("a-member", workspaceId, "member");
    expect((await listInvoices(new Request(`${BASE}/invoices`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("extends from the end through the checkout callback, idempotently with the webhook", async () => {
    const { workspaceId, userId } = await newCompany();
    signIn(userId, workspaceId);
    const buy = async (body: unknown) =>
      json<{ razorpay: { orderId: string; amountPaise: number } }>(
        await startCheckout(post("/checkout", body)),
      );
    const fake = new FakePaymentGateway();

    const first = await buy({
      kind: "new",
      planCode: "basic",
      months: 6,
      billingAddress: BILLING,
    });
    const bad = await verifyCheckout(
      post("/checkout/verify", {
        razorpayOrderId: first.razorpay.orderId,
        razorpayPaymentId: "pay_a",
        razorpaySignature: "0".repeat(64),
      }),
    );
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(bad)).toMatchObject({
      code: "PAYMENT_SIGNATURE_INVALID",
    });
    const verified = await verifyCheckout(
      post("/checkout/verify", {
        razorpayOrderId: first.razorpay.orderId,
        razorpayPaymentId: "pay_a",
        razorpaySignature: fake.sign(first.razorpay.orderId, "pay_a"),
      }),
    );
    expect(verified.status).toBe(StatusCodes.OK);
    expect(await json(verified)).toMatchObject({ status: "paid" });
    const active = await json<Overview>(
      await getSubscription(new Request(BASE)),
    );

    const extension = await buy({
      kind: "extend",
      months: 12,
      billingAddress: BILLING,
    });
    await webhook(
      signedWebhook(
        captured(
          extension.razorpay.orderId,
          "pay_b",
          extension.razorpay.amountPaise,
        ),
      ),
    );
    await verifyCheckout(
      post("/checkout/verify", {
        razorpayOrderId: extension.razorpay.orderId,
        razorpayPaymentId: "pay_b",
        razorpaySignature: fake.sign(extension.razorpay.orderId, "pay_b"),
      }),
    );
    const extended = await json<Overview>(
      await getSubscription(new Request(BASE)),
    );
    expect(extended.plan?.endsAt).toBe(
      addMonths(new Date(active.plan?.endsAt ?? ""), 12).toISOString(),
    );

    // Someone else's order is not found.
    const other = await newCompany();
    signIn(other.userId, other.workspaceId);
    const foreign = await verifyCheckout(
      post("/checkout/verify", {
        razorpayOrderId: extension.razorpay.orderId,
        razorpayPaymentId: "pay_b",
        razorpaySignature: fake.sign(extension.razorpay.orderId, "pay_b"),
      }),
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{ paths: Record<string, Record<string, unknown>> }>(
      getOpenApi(),
    );
    for (const [path, method] of [
      ["/api/construction/organization/subscription", "get"],
      ["/api/construction/organization/subscription/plans", "get"],
      ["/api/construction/organization/subscription/checkout", "post"],
      ["/api/construction/organization/subscription/checkout/quote", "post"],
      ["/api/construction/organization/subscription/checkout/verify", "post"],
      ["/api/construction/organization/subscription/invoices", "get"],
      ["/api/construction/organization/subscription/invoices/{id}/pdf", "get"],
      ["/api/webhooks/razorpay", "post"],
    ] as const)
      expect(spec.paths[path]?.[method]).toBeDefined();
  });
});

describe("Plan enforcement (CM-118)", () => {
  it("neither limits nor ends a Company with no plan", async () => {
    const { workspaceId, userId, designationId } = await newCompany();
    signIn(userId, workspaceId);
    expect(
      await requireAccess(
        new Request(
          "http://localhost/api/construction/organization/team-members",
        ),
        "organization.team_members",
        "create",
      ),
    ).not.toBeInstanceOf(Response);
    const members = createTeamMemberHandlers();
    // More than Basic's 5 Team Members.
    for (let index = 1; index <= 6; index += 1)
      await members.invite({
        workspaceId,
        by: userId,
        memberType: "normal",
        details: {
          name: `Member ${String(index)}`,
          designationId,
          mobile: `+9197${String(index).padStart(8, "0")}`,
        },
      });
  });

  it("refuses a Team Member beyond the plan with 402 and the limit", async () => {
    const { workspaceId, userId, designationId } = await newCompany();
    await givePlan(workspaceId);
    const members = createTeamMemberHandlers();
    const invite = (index: number, memberType: "normal" | "hrms") =>
      members.invite({
        workspaceId,
        by: userId,
        memberType,
        details: {
          name: `Member ${String(index)}`,
          designationId,
          mobile: `+9198${String(index).padStart(8, "0")}`,
        },
      });
    // The Owner is the first of Basic's 5 Team Members.
    for (let index = 1; index <= 4; index += 1) await invite(index, "normal");
    const error = await invite(5, "normal").catch((caught: unknown) => caught);
    const response = mapError(error);
    expect(response.status).toBe(StatusCodes.PAYMENT_REQUIRED);
    expect(await json(response)).toMatchObject({
      code: "PLAN_LIMIT_EXCEEDED",
      details: { grant: "team_member", limit: 5, used: 5 },
    });

    // HRMS seats are their own grant: 10 on Basic.
    for (let index = 10; index < 20; index += 1) await invite(index, "hrms");
    const hrms = mapError(
      await invite(20, "hrms").catch((caught: unknown) => caught),
    );
    expect(hrms.status).toBe(StatusCodes.PAYMENT_REQUIRED);
    expect(await json(hrms)).toMatchObject({
      code: "PLAN_LIMIT_EXCEEDED",
      details: { grant: "hrms_member", limit: 10, used: 10 },
    });
  });

  it("makes an ended plan read-only: writes 402, reads and export allowed, renewal open", async () => {
    const { workspaceId, userId, designationId } = await newCompany();
    await givePlan(workspaceId, { endsAt: new Date(Date.now() - 60_000) });
    signIn(userId, workspaceId);
    const request = () =>
      new Request(
        "http://localhost/api/construction/organization/team-members",
      );

    for (const flag of [
      "create",
      "update",
      "delete",
      "approve",
      "import",
    ] as const) {
      const denied = await requireAccess(
        request(),
        "organization.team_members",
        flag,
      );
      expect(denied).toBeInstanceOf(Response);
      const response = denied as Response;
      expect(response.status).toBe(StatusCodes.PAYMENT_REQUIRED);
      expect(await json(response)).toMatchObject({ code: "PLAN_EXPIRED" });
    }
    for (const flag of ["read", "export", "print", "report"] as const)
      expect(
        await requireAccess(request(), "organization.team_members", flag),
      ).not.toBeInstanceOf(Response);

    const overview = await json<Overview>(
      await getSubscription(new Request(BASE)),
    );
    expect(overview).toMatchObject({
      status: "expired",
      plan: { daysLeft: 0 },
    });

    await expect(
      createTeamMemberHandlers().invite({
        workspaceId,
        by: userId,
        memberType: "normal",
        details: { name: "Late", designationId, mobile: "+919811111111" },
      }),
    ).rejects.toMatchObject({ code: "PLAN_EXPIRED" });

    const renewal = await startCheckout(
      post("/checkout", {
        kind: "new",
        planCode: "basic",
        months: 12,
        billingAddress: BILLING,
      }),
    );
    expect(renewal.status).toBe(StatusCodes.CREATED);
  });
});
