import { describe, expect, it } from "vitest";

import { DomainError } from "./errors";
import { FeePlan } from "./fee-plan";
import { Paise } from "./paise";
import { ReceiptNumber } from "./receipt-number";

const NOW = new Date("2026-09-12T12:00:00.000Z");

describe("FeePlan", () => {
  it("copies the Course default fee as a one-time plan", () => {
    const plan = FeePlan.fromCourseDefault(Paise.create(500000), NOW);
    expect(plan.type).toBe("one_time");
    expect(plan.amount.value).toBe(500000);
    expect(plan.remainingDues(0).value).toBe(500000);
  });

  it("subtracts payments and concession from remaining dues", () => {
    const plan = FeePlan.create({
      type: "one_time",
      amount: Paise.create(500000),
      concession: Paise.create(100000),
      installmentCount: null,
      dueDates: [{ dueOn: "2026-09-12", amountPaise: 400000 }],
    });
    expect(plan.remainingDues(100000).value).toBe(300000);
  });

  it("rejects a plan below recorded Fee Payments", () => {
    const plan = FeePlan.create({
      type: "one_time",
      amount: Paise.create(200000),
      concession: Paise.create(0),
      installmentCount: null,
      dueDates: [{ dueOn: "2026-09-12", amountPaise: 200000 }],
    });
    expect(() => {
      plan.assertCoversPayments(300000);
    }).toThrow(DomainError);
    plan.assertCoversPayments(200000);
  });

  it("rejects an overpay", () => {
    const plan = FeePlan.fromCourseDefault(Paise.create(500000), NOW);
    expect(() => {
      plan.assertAcceptsPayment(Paise.create(500001), 0);
    }).toThrow(DomainError);
    plan.assertAcceptsPayment(Paise.create(100000), 0);
    plan.assertAcceptsPayment(Paise.create(400000), 100000);
    expect(() => {
      plan.assertAcceptsPayment(Paise.create(1), 500000);
    }).toThrow(DomainError);
  });

  it("mints sequential Receipt numbers", () => {
    expect(ReceiptNumber.fromSequence(1).value).toBe("R-0001");
    expect(ReceiptNumber.fromSequence(12).value).toBe("R-0012");
    expect(ReceiptNumber.create("R-0001").value).toBe("R-0001");
  });
});
