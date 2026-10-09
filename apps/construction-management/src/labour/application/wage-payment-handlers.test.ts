import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";
import type { ObjectStorage, StoredObject } from "@/src/shared-kernel/files";

import {
  WagePaymentHandlers,
  type PaymentParty,
  type StoredWagePayment,
  type WagePaymentStore,
} from "./wage-payment-handlers";

const PDF = new TextEncoder().encode("%PDF-1.4 receipt");

function fakes(options: { today?: string; parties?: PaymentParty[] } = {}) {
  const payments = new Map<string, StoredWagePayment>();
  const cancelled = new Set<string>();
  const parties = options.parties ?? [
    { id: "dhuresh", name: "Dhuresh", projectIds: ["tower"] },
    { id: "gang", name: "Prabhu Gang", projectIds: ["villa"] },
  ];
  const objects = new Map<string, Uint8Array>();
  const guarded: string[] = [];
  const store: WagePaymentStore = {
    find: (_w, id) =>
      Promise.resolve(cancelled.has(id) ? null : (payments.get(id) ?? null)),
    list: () =>
      Promise.resolve({
        items: [...payments.values()],
        total: payments.size,
        hasMore: false,
        totalAmount: 0,
      }),
    party: (_w, _t, id) =>
      Promise.resolve(parties.find((party) => party.id === id) ?? null),
    partyNames: (_w, _t, ids) =>
      Promise.resolve(
        new Map(
          parties
            .filter((party) => ids.includes(party.id))
            .map((party) => [party.id, party.name]),
        ),
      ),
    insert: (payment) => {
      payments.set(payment.id, payment);
      return Promise.resolve();
    },
    cancel: ({ payment, expectedUpdatedAt }) => {
      if (payment.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        return Promise.reject(
          new DomainError("PAYMENT_CHANGED", "stale", { kind: "conflict" }),
        );
      cancelled.add(payment.id);
      return Promise.resolve();
    },
    setReceipt: ({ payment, key }) => {
      payments.set(payment.id, { ...payment, documentKey: key });
      return Promise.resolve();
    },
    payers: () => Promise.resolve([{ id: "m1", name: "Owner" }]),
    memberIdOf: () => Promise.resolve("m1"),
    today: () => Promise.resolve(options.today ?? "2026-10-09"),
  };
  const storage: ObjectStorage = {
    put: (key, bytes) => {
      objects.set(key, bytes);
      return Promise.resolve();
    },
    get: (key) => {
      const bytes = objects.get(key);
      if (bytes == null) return Promise.resolve(null);
      const object: StoredObject = {
        body: new Blob([new Uint8Array(bytes)]).stream(),
        contentType: "application/pdf",
        contentLength: bytes.byteLength,
      };
      return Promise.resolve(object);
    },
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
  const handlers = new WagePaymentHandlers(
    store,
    {
      find: (_w, ids) =>
        Promise.resolve(
          new Map(
            ids
              .filter((id) => ["tower", "villa"].includes(id))
              .map((id) => [id, { id, name: id }]),
          ),
        ),
    },
    {
      find: (_w, ids) =>
        Promise.resolve(
          new Map(
            ids
              .filter((id) => id === "m1")
              .map((id) => [id, { id, name: "Owner" }]),
          ),
        ),
    },
    {
      assert: (action, _actor, partyType, date) => {
        guarded.push(`${action}:${partyType}:${date}`);
        return Promise.resolve();
      },
    },
    storage,
    () => new Date("2026-10-09T06:00:00Z"),
  );
  return { handlers, payments, cancelled, objects, guarded };
}

const actor = { workspaceId: "w", userId: "u", role: "owner" as const };

const input = {
  actor,
  partyType: "labour" as const,
  partyId: "dhuresh",
  projectId: "tower",
  paymentDate: "2026-10-05",
  kind: "payment" as const,
  mode: "cash" as const,
  amount: 50_000,
};

describe("WagePaymentHandlers", () => {
  it("records a payment after the back-dated check, with names for the screen", async () => {
    const { handlers, guarded } = fakes();
    const payment = await handlers.record({ ...input, paidByMemberId: "m1" });
    expect(payment).toMatchObject({
      partyName: "Dhuresh",
      projectName: "tower",
      paidBy: { id: "m1", name: "Owner" },
      amount: 50_000,
      receiptVersion: null,
    });
    expect(guarded).toEqual(["create:labour:2026-10-05"]);
  });

  it.each([
    [{ amount: 0 }, "PAYMENT_AMOUNT_INVALID"],
    [{ paymentDate: "2026-10-10" }, "PAYMENT_DATE_IN_FUTURE"],
    [{ paymentDate: "05-10-2026" }, "PAYMENT_DATE_INVALID"],
    [{ partyId: "nobody" }, "LABOUR_NOT_FOUND"],
    [{ partyType: "vendor" as const, partyId: "nobody" }, "VENDOR_NOT_FOUND"],
    [
      { partyType: "vendor" as const, partyId: "gang" },
      "VENDOR_NOT_ON_PROJECT",
    ],
    [{ projectId: "elsewhere" }, "PROJECT_NOT_FOUND"],
    [{ paidByMemberId: "m9" }, "TEAM_MEMBER_NOT_FOUND"],
  ])("refuses %o with %s", async (change, code) => {
    const { handlers, payments } = fakes();
    await expect(
      handlers.record({ ...input, ...change }),
    ).rejects.toMatchObject({ code });
    expect(payments.size).toBe(0);
  });

  it("pays a vendor on a Project it is assigned to, and a Labour on any live Project", async () => {
    const { handlers } = fakes();
    await expect(
      handlers.record({
        ...input,
        partyType: "vendor",
        partyId: "gang",
        projectId: "villa",
      }),
    ).resolves.toMatchObject({ partyName: "Prabhu Gang" });
    await expect(
      handlers.record({ ...input, projectId: "villa" }),
    ).resolves.toMatchObject({ projectId: "villa" });
  });

  it("cancels with the loaded updatedAt, checking the edit limit on the payment date", async () => {
    const { handlers, cancelled, guarded } = fakes();
    const payment = await handlers.record(input);
    await expect(
      handlers.cancel({
        actor,
        id: payment.id,
        expectedUpdatedAt: new Date(0),
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_CHANGED" });
    await handlers.cancel({
      actor,
      id: payment.id,
      expectedUpdatedAt: payment.updatedAt,
    });
    expect(cancelled.has(payment.id)).toBe(true);
    expect(guarded.at(-1)).toBe("edit:labour:2026-10-05");
    await expect(handlers.get("w", payment.id)).rejects.toMatchObject({
      code: "PAYMENT_NOT_FOUND",
    });
  });

  it("keeps one receipt: attach replaces the old file, remove deletes it", async () => {
    const { handlers, objects } = fakes();
    const payment = await handlers.record(input);
    const first = await handlers.attachReceipt({
      actor,
      id: payment.id,
      bytes: PDF,
      contentType: "application/pdf",
    });
    expect(first.receiptVersion).not.toBeNull();
    const second = await handlers.attachReceipt({
      actor,
      id: payment.id,
      bytes: PDF,
      contentType: "application/pdf",
    });
    expect(second.receiptVersion).not.toBe(first.receiptVersion);
    expect(objects.size).toBe(1);
    await expect(
      handlers.attachReceipt({
        actor,
        id: payment.id,
        bytes: new TextEncoder().encode("hello"),
        contentType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect((await handlers.receipt("w", payment.id)).contentType).toBe(
      "application/pdf",
    );
    const removed = await handlers.removeReceipt({ actor, id: payment.id });
    expect(removed.receiptVersion).toBeNull();
    expect(objects.size).toBe(0);
    await expect(handlers.receipt("w", payment.id)).rejects.toMatchObject({
      code: "RECEIPT_NOT_FOUND",
    });
  });

  it("offers active Team Members with the caller's own as the default payer", async () => {
    const { handlers } = fakes();
    await expect(handlers.payers("w", "u")).resolves.toEqual({
      items: [{ id: "m1", name: "Owner" }],
      currentMemberId: "m1",
    });
  });
});
