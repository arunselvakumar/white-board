import { DomainError } from "./errors";
import { Paise } from "./paise";

export const FEE_PLAN_TYPES = ["one_time", "monthly", "installments"] as const;

export type FeePlanTypeValue = (typeof FEE_PLAN_TYPES)[number];

export type FeePlanDueDate = {
  dueOn: string;
  amountPaise: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class FeePlan {
  private constructor(
    readonly type: FeePlanTypeValue,
    readonly amount: Paise,
    readonly concession: Paise,
    readonly installmentCount: number | null,
    readonly dueDates: readonly FeePlanDueDate[],
  ) {}

  static fromCourseDefault(amount: Paise, now: Date): FeePlan {
    return FeePlan.create({
      type: "one_time",
      amount,
      concession: Paise.create(0),
      installmentCount: null,
      dueDates: [
        {
          dueOn: now.toISOString().slice(0, 10),
          amountPaise: amount.value,
        },
      ],
    });
  }

  static create(input: {
    type: string;
    amount: Paise;
    concession: Paise;
    installmentCount: number | null;
    dueDates: FeePlanDueDate[];
  }): FeePlan {
    if (!FEE_PLAN_TYPES.includes(input.type as FeePlanTypeValue)) {
      throw new DomainError(
        "FEE_PLAN_TYPE_INVALID",
        "Fee Plan type must be one-time, monthly, or installments.",
      );
    }
    if (input.concession.value > input.amount.value) {
      throw new DomainError(
        "FEE_PLAN_CONCESSION_INVALID",
        "Concession cannot exceed the Fee Plan amount.",
      );
    }
    if (input.type === "installments") {
      if (
        input.installmentCount == null ||
        !Number.isInteger(input.installmentCount) ||
        input.installmentCount < 2
      ) {
        throw new DomainError(
          "FEE_PLAN_INSTALLMENTS_INVALID",
          "Installments need a count of at least 2.",
        );
      }
    } else if (input.installmentCount != null) {
      throw new DomainError(
        "FEE_PLAN_INSTALLMENTS_INVALID",
        "Installment count is only for an installments Fee Plan.",
      );
    }
    if (input.dueDates.length === 0) {
      throw new DomainError(
        "FEE_PLAN_DUE_DATES_REQUIRED",
        "Fee Plan needs at least one due date.",
      );
    }
    const dueDates = input.dueDates.map((item) => {
      if (!DATE_RE.test(item.dueOn)) {
        throw new DomainError(
          "FEE_PLAN_DUE_DATE_INVALID",
          "Due dates must be YYYY-MM-DD.",
        );
      }
      Paise.create(item.amountPaise);
      return { dueOn: item.dueOn, amountPaise: item.amountPaise };
    });
    return new FeePlan(
      input.type as FeePlanTypeValue,
      input.amount,
      input.concession,
      input.installmentCount,
      dueDates,
    );
  }

  get netAmount(): Paise {
    return Paise.create(this.amount.value - this.concession.value);
  }

  remainingDues(paidPaise: number): Paise {
    const paid = Paise.create(paidPaise);
    const remaining = this.netAmount.value - paid.value;
    return Paise.create(Math.max(0, remaining));
  }

  assertAcceptsPayment(amount: Paise, paidPaise: number): void {
    if (amount.value < 1) {
      throw new DomainError(
        "FEE_PAYMENT_INVALID",
        "Fee Payment must be at least 1 paise.",
      );
    }
    const remaining = this.netAmount.value - Paise.create(paidPaise).value;
    if (amount.value > remaining) {
      throw new DomainError(
        "FEE_OVERPAY",
        "Fee Payment cannot exceed remaining dues.",
      );
    }
  }

  toJson(): {
    type: FeePlanTypeValue;
    amountPaise: number;
    concessionPaise: number;
    installmentCount: number | null;
    dueDates: FeePlanDueDate[];
  } {
    return {
      type: this.type,
      amountPaise: this.amount.value,
      concessionPaise: this.concession.value,
      installmentCount: this.installmentCount,
      dueDates: this.dueDates.map((item) => ({ ...item })),
    };
  }
}
