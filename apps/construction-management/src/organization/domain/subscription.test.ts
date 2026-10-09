import { describe, expect, it } from "vitest";

import { quoteCheckout } from "./checkout";
import { PlanCatalogue } from "./plan";
import { addMonths, prorate, Subscription, DAY_MS } from "./subscription";
import {
  fiscalYearOf,
  invoiceNumber,
  billingAddress,
} from "./subscription-order";
import { usageBars } from "./usage";

const catalogue = PlanCatalogue.of({
  version: 1,
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
    {
      code: "pro",
      name: "Pro",
      rank: 2,
      durations: [{ months: 12, pricePaise: 4_200_000 }],
      includes: {
        project: 30,
        team_member: 20,
        hrms_member: 50,
        storage_gb: 100,
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
});

const NOW = new Date("2026-10-08T06:30:00.000Z");
const days = (count: number) => new Date(NOW.getTime() + count * DAY_MS);

function paid(input: {
  startsAt: Date;
  endsAt: Date;
  planCode?: string;
  paidValue?: number;
  addOns?: Record<string, number>;
}) {
  return new Subscription(
    "s",
    "w",
    input.planCode ?? "basic",
    input.startsAt,
    input.endsAt,
    false,
    input.addOns ?? {},
    input.paidValue ?? 1_400_000,
  );
}

const quote = (
  subscription: Subscription | null,
  choice: Parameters<typeof quoteCheckout>[0]["choice"],
  buyerStateCode = "33",
) =>
  quoteCheckout({
    catalogue,
    subscription,
    choice,
    buyerStateCode,
    sellerStateCode: "33",
    now: NOW,
  });

describe("Subscription status (CM-116)", () => {
  it("is active with its plan's limits and days left, then expired", () => {
    const subscription = paid({ startsAt: NOW, endsAt: days(14) });
    expect(subscription.status(NOW)).toBe("active");
    expect(subscription.daysLeft(NOW)).toBe(14);
    expect(subscription.daysLeft(new Date(NOW.getTime() + 1))).toBe(14);
    expect(subscription.limits(catalogue)).toEqual({
      project: 10,
      team_member: 5,
      hrms_member: 10,
      storage_gb: 20,
    });
    expect(subscription.status(days(14))).toBe("expired");
    expect(subscription.daysLeft(days(15))).toBe(0);
  });

  it("adds add-on units to the limits; storage in 30 GB units", () => {
    const subscription = paid({
      startsAt: NOW,
      endsAt: days(180),
      addOns: { team_member: 2, storage_gb: 1 },
    });
    expect(subscription.status(NOW)).toBe("active");
    expect(subscription.limits(catalogue)).toMatchObject({
      team_member: 7,
      storage_gb: 50,
    });
  });

  it("draws usage bars with storage to one decimal", () => {
    expect(
      usageBars(
        { project: 0, team_member: 3, hrms_member: 1, storage_gb: 1.234 },
        { project: 10, team_member: 5, hrms_member: 10, storage_gb: 20 },
      ),
    ).toEqual([
      { grant: "project", used: 0, limit: 10 },
      { grant: "team_member", used: 3, limit: 5 },
      { grant: "hrms_member", used: 1, limit: 10 },
      { grant: "storage_gb", used: 1.3, limit: 20 },
    ]);
  });
});

describe("Checkout prices (CM-117)", () => {
  it("prices a new plan with add-ons by the month, CGST+SGST in the seller's state", () => {
    const result = quote(null, {
      kind: "new",
      planCode: "basic",
      months: 6,
      addOns: { team_member: 2 },
    });
    expect(result.lines.map((line) => line.amount)).toEqual([
      1_400_000,
      2 * 29_900 * 6,
    ]);
    expect(result.subTotal).toBe(1_758_800);
    expect(result.lastPlanDiscount).toBe(0);
    expect(result.tax).toEqual({ cgst: 158_292, sgst: 158_292, igst: 0 });
    expect(result.total).toBe(1_758_800 + 316_584);
    expect(result.endsAt).toEqual(addMonths(NOW, 6));
  });

  it("charges IGST across states", () => {
    const result = quote(
      null,
      { kind: "new", planCode: "basic", months: 12 },
      "29",
    );
    expect(result.tax).toEqual({ cgst: 0, sgst: 0, igst: 378_000 });
    expect(result.total).toBe(2_478_000);
  });

  it("enforces add-on minimums and offered durations", () => {
    expect(() =>
      quote(null, {
        kind: "new",
        planCode: "basic",
        months: 6,
        addOns: { hrms_member: 2 },
      }),
    ).toThrow(
      expect.objectContaining({ code: "ADD_ON_QUANTITY_INVALID" }) as Error,
    );
    expect(() =>
      quote(null, { kind: "new", planCode: "basic", months: 3 }),
    ).toThrow(
      expect.objectContaining({ code: "DURATION_NOT_OFFERED" }) as Error,
    );
  });

  it("allows only a new plan when none is running (none yet, or ended)", () => {
    const ended = paid({ startsAt: days(-200), endsAt: days(-20) });
    for (const current of [null, ended])
      for (const kind of ["extend", "upgrade", "add_ons"] as const)
        expect(() =>
          quote(current, {
            kind,
            planCode: "basic",
            months: 6,
            addOns: { team_member: 1 },
          }),
        ).toThrow(
          expect.objectContaining({ code: "CHECKOUT_NOT_ALLOWED" }) as Error,
        );
    expect(
      quote(ended, { kind: "new", planCode: "basic", months: 6 }).endsAt,
    ).toEqual(addMonths(NOW, 6));
    const running = paid({ startsAt: days(-10), endsAt: days(170) });
    expect(() =>
      quote(running, { kind: "new", planCode: "basic", months: 6 }),
    ).toThrow(
      expect.objectContaining({ code: "CHECKOUT_NOT_ALLOWED" }) as Error,
    );
  });

  it("extends from the current end and renews the running add-ons", () => {
    const running = paid({
      startsAt: days(-10),
      endsAt: days(170),
      addOns: { team_member: 1 },
    });
    const result = quote(running, { kind: "extend", months: 12 });
    expect(result.lines.map((line) => line.amount)).toEqual([
      2_100_000,
      29_900 * 12,
    ]);
    expect(result.endsAt).toEqual(addMonths(days(170), 12));
  });

  it("upgrades to the same or a higher plan with the unused value as discount", () => {
    // 180-day period, 90 days left of ₹14,000 paid → ₹7,000 credit.
    const running = paid({ startsAt: days(-90), endsAt: days(90) });
    const result = quote(running, {
      kind: "upgrade",
      planCode: "pro",
      months: 12,
    });
    expect(result.lastPlanDiscount).toBe(700_000);
    expect(result.taxableAmount).toBe(4_200_000 - 700_000);
    expect(result.endsAt).toEqual(addMonths(NOW, 12));

    const onPro = paid({
      startsAt: days(-10),
      endsAt: days(355),
      planCode: "pro",
    });
    expect(() =>
      quote(onPro, { kind: "upgrade", planCode: "basic", months: 6 }),
    ).toThrow(
      expect.objectContaining({ code: "PLAN_DOWNGRADE_NOT_ALLOWED" }) as Error,
    );
  });

  it("pro-rates add-ons on a running plan by days left (1/30 of a month per day)", () => {
    const running = paid({ startsAt: days(-170), endsAt: days(10) });
    const result = quote(running, {
      kind: "add_ons",
      addOns: { team_member: 3 },
    });
    expect(result.days).toBe(10);
    expect(result.lines[0]?.amount).toBe(prorate(3 * 29_900, 10, 30));
    expect(result.subTotal).toBe(29_900);
    expect(() => quote(running, { kind: "add_ons", addOns: {} })).toThrow(
      expect.objectContaining({ code: "ADD_ONS_REQUIRED" }) as Error,
    );
  });
});

describe("Applying a paid order (CM-117)", () => {
  it("starts the first Subscription from a new plan, when paid", () => {
    const terms = {
      kind: "new" as const,
      planCode: "basic",
      months: 6,
      addOns: { team_member: 1 },
      subTotal: 1_579_400,
    };
    const after = Subscription.started({
      id: "s",
      workspaceId: "w",
      terms,
      paidAt: days(3),
    });
    expect(after).toMatchObject({
      planCode: "basic",
      startsAt: days(3),
      endsAt: addMonths(days(3), 6),
      addOns: { team_member: 1 },
      paidValue: 1_579_400,
    });
    expect(after.status(days(3))).toBe("active");
    expect(() =>
      Subscription.started({
        id: "s",
        workspaceId: "w",
        terms: { ...terms, kind: "extend" },
        paidAt: NOW,
      }),
    ).toThrow();
  });

  it("restarts an ended plan from a new order, when paid", () => {
    const ended = paid({ startsAt: days(-200), endsAt: days(-20) });
    expect(
      ended.afterPayment(
        {
          kind: "new",
          planCode: "basic",
          months: 12,
          addOns: {},
          subTotal: 2_100_000,
        },
        NOW,
      ),
    ).toMatchObject({
      startsAt: NOW,
      endsAt: addMonths(NOW, 12),
      paidValue: 2_100_000,
    });
  });

  it("extends from the end, or from payment once ended", () => {
    const running = paid({ startsAt: days(-10), endsAt: days(170) });
    const terms = {
      kind: "extend" as const,
      planCode: "basic",
      months: 6,
      addOns: {},
      subTotal: 1_400_000,
    };
    expect(running.afterPayment(terms, NOW)).toMatchObject({
      startsAt: days(-10),
      endsAt: addMonths(days(170), 6),
      paidValue: 2_800_000,
    });
    expect(running.afterPayment(terms, days(200))).toMatchObject({
      startsAt: days(200),
      endsAt: addMonths(days(200), 6),
      paidValue: 1_400_000,
    });
  });

  it("adds add-on units to the running ones", () => {
    const running = paid({
      startsAt: days(-10),
      endsAt: days(170),
      addOns: { team_member: 1 },
    });
    const after = running.afterPayment(
      {
        kind: "add_ons",
        planCode: "basic",
        months: null,
        addOns: { team_member: 2, storage_gb: 1 },
        subTotal: 1000,
      },
      NOW,
    );
    expect(after.addOns).toEqual({ team_member: 3, storage_gb: 1 });
    expect(after.endsAt).toEqual(days(170));
  });
});

describe("Invoices and billing addresses", () => {
  it("numbers invoices per Indian fiscal year in IST", () => {
    expect(fiscalYearOf(new Date("2027-03-31T18:29:00.000Z"))).toBe("26-27");
    expect(fiscalYearOf(new Date("2027-03-31T18:31:00.000Z"))).toBe("27-28");
    expect(invoiceNumber("26-27", 42)).toBe("CM/26-27/00042");
  });

  it("checks the GSTIN and that it belongs to the billing state", () => {
    expect(
      billingAddress({
        name: "Anugraha Engineers",
        address: "Vadasery, Nagercoil",
        stateCode: "33",
        gstin: "33aapfa0939f1zm",
      }),
    ).toMatchObject({ gstin: "33AAPFA0939F1ZM" });
    expect(() =>
      billingAddress({
        name: "Anugraha",
        address: "Nagercoil",
        stateCode: "29",
        gstin: "33AAPFA0939F1ZM",
      }),
    ).toThrow(
      expect.objectContaining({ code: "GSTIN_STATE_MISMATCH" }) as Error,
    );
    expect(() =>
      billingAddress({
        name: "Anugraha",
        address: "Nagercoil",
        stateCode: "33",
        gstin: "33AAPFA0939F1ZW",
      }),
    ).toThrow(expect.objectContaining({ code: "GSTIN_INVALID" }) as Error);
    expect(() =>
      billingAddress({
        name: "Anugraha",
        address: "Nagercoil",
        stateCode: "25",
      }),
    ).toThrow(
      expect.objectContaining({ code: "BILLING_STATE_INVALID" }) as Error,
    );
  });
});
