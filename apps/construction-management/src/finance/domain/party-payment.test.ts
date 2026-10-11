import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertDirection,
  assertTdsAllowed,
  checkAllocations,
  paymentEntries,
  type AllocatableInvoice,
} from "./party-payment";

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "OTHER";
  }
}

const place = { kind: "project" as const, id: "p1" };

function invoice(patch: Partial<AllocatableInvoice> = {}): AllocatableInvoice {
  return {
    id: "i1",
    invoiceNumber: "B-1",
    partyType: "contractor",
    partyId: "c1",
    place,
    direction: "payable",
    settled: false,
    balance: 1000n,
    ...patch,
  };
}

function check(
  invoices: AllocatableInvoice[],
  allocations: { invoiceId: string; amount: bigint }[],
  available = 5000n,
  direction: "out" | "in" = "out",
) {
  return checkAllocations({
    partyType: "contractor",
    partyId: "c1",
    place,
    direction,
    available,
    allocations,
    invoices: new Map(invoices.map((row) => [row.id, row])),
  });
}

describe("allocation", () => {
  it("allocates within each balance and the settled amount", () => {
    expect(
      check(
        [invoice(), invoice({ id: "i2", invoiceNumber: "B-2" })],
        [
          { invoiceId: "i1", amount: 1000n },
          { invoiceId: "i2", amount: 400n },
        ],
      ),
    ).toBe(1400n);
  });

  it("refuses more than the payment settles", () => {
    expect(
      code(() => check([invoice()], [{ invoiceId: "i1", amount: 900n }], 800n)),
    ).toBe("ALLOCATION_EXCEEDS_PAYMENT");
  });

  it("refuses more than an invoice's balance", () => {
    expect(
      code(() => check([invoice()], [{ invoiceId: "i1", amount: 1001n }])),
    ).toBe("ALLOCATION_EXCEEDS_BALANCE");
  });

  it("refuses another party's, another place's, the wrong direction's, a settled or a repeated invoice", () => {
    const one = [{ invoiceId: "i1", amount: 10n }];
    expect(code(() => check([invoice({ partyId: "c2" })], one))).toBe(
      "ALLOCATION_OTHER_PARTY",
    );
    expect(
      code(() =>
        check([invoice({ place: { kind: "project", id: "p2" } })], one),
      ),
    ).toBe("ALLOCATION_OTHER_PLACE");
    expect(code(() => check([invoice({ direction: "receivable" })], one))).toBe(
      "ALLOCATION_WRONG_DIRECTION",
    );
    expect(code(() => check([invoice({ settled: true })], one))).toBe(
      "INVOICE_SETTLED",
    );
    expect(code(() => check([invoice()], [...one, ...one]))).toBe(
      "ALLOCATION_DUPLICATE",
    );
    expect(code(() => check([], one))).toBe("INVOICE_NOT_FOUND");
  });
});

describe("direction and TDS", () => {
  it("takes Payment In only from an Other Party", () => {
    expect(
      code(() => {
        assertDirection("supplier", "in");
      }),
    ).toBe("PAYMENT_IN_ONLY_FOR_OTHER_PARTIES");
    expect(
      code(() => {
        assertDirection("other_party", "in");
      }),
    ).toBeNull();
  });

  it("deducts TDS only on payments out to a Contractor", () => {
    expect(
      code(() => {
        assertTdsAllowed("supplier", "out", 100n);
      }),
    ).toBe("TDS_ONLY_FOR_CONTRACTORS");
    expect(
      code(() => {
        assertTdsAllowed("supplier", "out", 0n);
      }),
    ).toBeNull();
    expect(
      code(() => {
        assertTdsAllowed("contractor", "out", 100n);
      }),
    ).toBeNull();
  });
});

describe("payment entries", () => {
  const payment = {
    id: "pay",
    number: "PAY/26-27/00001",
    partyType: "contractor" as const,
    partyId: "c1",
    partyName: "Velan Constructions",
    place,
    direction: "out" as const,
    paymentDate: "2026-06-10",
    accountId: "acc",
    mode: "online" as const,
    reference: "UTR1",
    paymentCategoryId: null,
    amount: 99_000n,
    tdsAmount: 1_000n,
    remarks: null,
  };

  it("moves the account by what was paid and the party by paid + TDS", () => {
    const entries = paymentEntries(payment);
    expect(entries.party.map((entry) => [entry.kind, entry.amount])).toEqual([
      ["payment", -99_000n],
      ["tds", -1_000n],
    ]);
    expect(entries.account).toMatchObject({
      kind: "payment",
      amount: -99_000n,
      counterpartyKind: "contractor",
      counterpartyName: "Velan Constructions",
      documentNumber: "PAY/26-27/00001",
      reference: "UTR1",
    });
  });

  it("posts a receipt both ways for a Payment In", () => {
    const entries = paymentEntries({
      ...payment,
      partyType: "other_party",
      direction: "in",
      tdsAmount: 0n,
    });
    expect(entries.party.map((entry) => [entry.kind, entry.amount])).toEqual([
      ["receipt", 99_000n],
    ]);
    expect(entries.account).toMatchObject({ kind: "receipt", amount: 99_000n });
  });
});
