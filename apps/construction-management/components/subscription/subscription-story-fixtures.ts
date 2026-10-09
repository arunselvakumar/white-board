/**
 * Storybook data and a `fetch` stand-in for the subscription APIs. Stories
 * call `mockSubscriptionApi()` in `beforeEach` and return its cleanup.
 */
import { fn } from "storybook/test";

import { getQueryClient } from "@/src/queries/query-client";
import type {
  InvoicesPage,
  PlansView,
  QuoteView,
  SubscriptionView,
} from "@/src/queries/subscription";

const USAGE: SubscriptionView["usage"] = [
  { grant: "project", used: 0, limit: 10 },
  { grant: "team_member", used: 3, limit: 5 },
  { grant: "hrms_member", used: 0, limit: 10 },
  { grant: "storage_gb", used: 1.2, limit: 20 },
];

/** A new Company: no plan yet, so nothing is limited. */
export const noPlanView: SubscriptionView = {
  status: "none",
  plan: null,
  usage: USAGE.map((bar) => ({ ...bar, limit: null })),
  addOns: [],
  canManage: true,
  owner: {
    unusedValuePaise: 0,
    lastBillingAddress: null,
    paymentsConfigured: true,
  },
};

export const activeView: SubscriptionView = {
  status: "active",
  plan: {
    code: "basic",
    name: "Basic",
    startsAt: "2026-10-08T06:30:00.000Z",
    endsAt: "2027-04-08T06:30:00.000Z",
    daysLeft: 182,
    autoRenew: false,
  },
  usage: USAGE.map((bar) =>
    bar.grant === "team_member" ? { ...bar, used: 7, limit: 7 } : bar,
  ),
  addOns: [{ grant: "team_member", name: "Extra Team Member", quantity: 2 }],
  canManage: true,
  owner: {
    unusedValuePaise: 1_400_000,
    lastBillingAddress: {
      name: "Anugraha Engineers",
      address: "Plot 4, Vadasery, Nagercoil 629001",
      stateCode: "33",
      gstin: "33AAPFA0939F1ZM",
    },
    paymentsConfigured: true,
  },
};

/** A running plan with a few days left. */
export const endingSoonView: SubscriptionView = {
  ...activeView,
  plan: {
    code: "basic",
    name: "Basic",
    startsAt: "2026-04-14T06:30:00.000Z",
    endsAt: "2026-10-14T06:30:00.000Z",
    daysLeft: 5,
    autoRenew: false,
  },
};

export const expiredView: SubscriptionView = {
  status: "expired",
  plan: {
    code: "basic",
    name: "Basic",
    startsAt: "2026-04-06T06:30:00.000Z",
    endsAt: "2026-10-06T06:30:00.000Z",
    daysLeft: 0,
    autoRenew: false,
  },
  usage: USAGE,
  addOns: [],
  canManage: true,
  owner: {
    unusedValuePaise: 0,
    lastBillingAddress: null,
    paymentsConfigured: true,
  },
};

export const memberView: SubscriptionView = {
  ...activeView,
  canManage: false,
  owner: null,
};

export const plans: PlansView = {
  version: 1,
  currency: "INR",
  gstRatePercent: 18,
  paymentsConfigured: true,
  plans: [
    {
      code: "basic",
      name: "Basic",
      rank: 1,
      durations: [
        { months: 6, pricePaise: 1_400_000 },
        { months: 12, pricePaise: 2_100_000 },
      ],
      includes: {
        project: 10,
        team_member: 5,
        hrms_member: 10,
        storage_gb: 20,
      },
    },
  ],
  addOns: [
    {
      grant: "team_member",
      name: "Extra Team Member",
      unitSize: 1,
      pricePerUnitPerMonthPaise: 29_900,
      minimumQuantity: 1,
    },
    {
      grant: "project",
      name: "Extra Project",
      unitSize: 1,
      pricePerUnitPerMonthPaise: 29_900,
      minimumQuantity: 1,
    },
    {
      grant: "storage_gb",
      name: "30 GB storage",
      unitSize: 30,
      pricePerUnitPerMonthPaise: 29_900,
      minimumQuantity: 1,
    },
    {
      grant: "hrms_member",
      name: "HRMS Team Member",
      unitSize: 1,
      pricePerUnitPerMonthPaise: 3_000,
      minimumQuantity: 5,
    },
  ],
};

export const invoices: InvoicesPage = {
  items: [
    {
      id: "0199c4a2-0000-7000-8000-000000000001",
      invoiceNumber: "CM/26-27/00001",
      kind: "new",
      planName: "Basic",
      months: 6,
      paidAt: "2026-10-08T06:30:00.000Z",
      totalPaise: 2_075_384,
      currency: "INR",
      pdfPath:
        "/api/construction/organization/subscription/invoices/0199c4a2-0000-7000-8000-000000000001/pdf",
    },
  ],
  nextCursor: null,
  prevCursor: null,
  total: 1,
};

export const noInvoices: InvoicesPage = {
  items: [],
  nextCursor: null,
  prevCursor: null,
  total: 0,
};

export const quote: QuoteView = {
  kind: "new",
  planCode: "basic",
  planName: "Basic",
  months: 12,
  days: null,
  lines: [
    {
      item: "plan",
      description: "Basic plan, 12 months",
      ratePaise: 2_100_000,
      quantity: 1,
      months: 12,
      days: null,
      amountPaise: 2_100_000,
    },
    {
      item: "team_member",
      description: "Extra Team Member",
      ratePaise: 29_900,
      quantity: 2,
      months: 12,
      days: null,
      amountPaise: 717_600,
    },
  ],
  subTotalPaise: 2_817_600,
  lastPlanDiscountPaise: 0,
  taxableAmountPaise: 2_817_600,
  cgstPaise: 253_584,
  sgstPaise: 253_584,
  igstPaise: 0,
  totalPaise: 3_324_768,
  currency: "INR",
  startsAt: "2026-10-08T06:30:00.000Z",
  endsAt: "2027-10-08T06:30:00.000Z",
};

type Api = {
  subscription?: SubscriptionView;
  plans?: PlansView;
  invoices?: InvoicesPage;
  quote?: QuoteView;
};

/** Answers the subscription routes from fixtures; returns the spy and a cleanup. */
export function mockSubscriptionApi(api: Api = {}) {
  getQueryClient().clear();
  const original = globalThis.fetch;
  const spy = fn((...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const path = url.split("?")[0] ?? url;
    const post = init?.method === "POST";
    const base = "/api/construction/organization/subscription";
    let body: unknown = { code: "NOT_FOUND", message: "Not mocked." };
    let status = 200;
    if (!post && path.endsWith(`${base}/plans`)) body = api.plans ?? plans;
    else if (!post && path.endsWith(`${base}/invoices`))
      body = api.invoices ?? noInvoices;
    else if (!post && path.endsWith(base))
      body = api.subscription ?? noPlanView;
    else if (post && path.endsWith(`${base}/checkout/quote`))
      body = api.quote ?? quote;
    else if (post && path.endsWith(`${base}/checkout/verify`))
      body = {
        orderId: "0199c4a2-0000-7000-8000-000000000002",
        status: "paid",
        invoiceNumber: "CM/26-27/00002",
      };
    else if (post && path.endsWith(`${base}/checkout`)) {
      const choice = api.quote ?? quote;
      status = 201;
      body = {
        orderId: "0199c4a2-0000-7000-8000-000000000002",
        quote: choice,
        razorpay: {
          keyId: "rzp_test_story",
          orderId: "order_story_1",
          amountPaise: choice.totalPaise,
          currency: "INR",
        },
      };
    } else status = 404;
    return Promise.resolve(Response.json(body, { status }));
  });
  globalThis.fetch = spy;
  return {
    spy,
    restore: () => {
      globalThis.fetch = original;
      getQueryClient().clear();
    },
  };
}
