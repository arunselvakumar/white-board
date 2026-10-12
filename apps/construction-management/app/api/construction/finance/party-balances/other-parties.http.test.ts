import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/companies";
import { accountBalance } from "@/test/finance";
import {
  codeOf,
  getFrom,
  idParams,
  json,
  partiesMember,
  partyBalance,
  partyWorld,
  postTo,
  TODAY,
  type PartyWorld,
} from "@/test/party-finance";

import type { ConstructionFinanceInvoiceResponse } from "../invoices/invoice-models";
import { POST as settleInvoice } from "../invoices/[id]/settle/route";
import { POST as createInvoice } from "../invoices/route";
import { POST as recordPayment } from "../party-payments/route";
import { POST as approveSettlement } from "../settlements/[id]/approve/route";
import { POST as rejectSettlement } from "../settlements/[id]/reject/route";
import { POST as bulkReject } from "../settlements/bulk-reject/route";
import { GET as listSettlements } from "../settlements/route";
import type { ListConstructionFinanceWorkspacePartyBalancesResponse } from "./party-balance-workspace-models";
import { GET as partyBalances } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

type Invoice = ConstructionFinanceInvoiceResponse;
type Settlement = {
  id: string;
  status: string;
  amount: number;
  invoice: { id: string; party: { type: string } };
  actions: { approve: boolean; reject: boolean };
};

async function sale(
  world: PartyWorld,
  amount: number,
  projectId = world.projectId,
): Promise<Invoice> {
  const response = await createInvoice(
    postTo("/invoices", {
      partyType: "other_party",
      partyId: world.otherPartyId,
      projectId,
      direction: "receivable",
      invoiceDate: TODAY,
      amount,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Invoice>(response);
}

async function purchase(
  world: PartyWorld,
  amount: number,
  projectId = world.projectId,
): Promise<Invoice> {
  const response = await createInvoice(
    postTo("/invoices", {
      partyType: "other_party",
      partyId: world.otherPartyId,
      projectId,
      invoiceNumber: `KC-${String(amount)}-${projectId.slice(0, 4)}`,
      invoiceDate: TODAY,
      amount,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Invoice>(response);
}

function paymentIn(world: PartyWorld, patch: Record<string, unknown>) {
  return recordPayment(
    postTo("/party-payments", {
      partyType: "other_party",
      partyId: world.otherPartyId,
      projectId: world.projectId,
      direction: "in",
      paymentDate: TODAY,
      accountId: world.cashId,
      mode: "cash",
      ...patch,
    }),
  );
}

async function settlementsOf(
  world: PartyWorld,
  status: "pending" | "approved" | "rejected",
  partyType = "other_party",
): Promise<Settlement[]> {
  return (
    await json<{ items: Settlement[] }>(
      await listSettlements(
        getFrom("/settlements", {
          status,
          projectId: world.projectId,
          partyType,
        }),
      ),
    )
  ).items;
}

async function raise(invoiceId: string, reason = "Customer discount") {
  const response = await settleInvoice(
    postTo(`/invoices/${invoiceId}/settle`, { reason }),
    idParams(invoiceId),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
}

describe("Other Party invoices and payments (CM-708)", () => {
  it("numbers sales invoices by the INV rule in order and types purchase numbers", async () => {
    const world = await partyWorld();
    const first = await sale(world, 10_000_00);
    const second = await sale(world, 5_000_00);
    expect(first.invoiceNumber).toMatch(/^INV\/\d{2}-\d{2}\/00001$/);
    expect(second.invoiceNumber).toMatch(/^INV\/\d{2}-\d{2}\/00002$/);
    const bought = await purchase(world, 3_000_00);
    expect(bought.invoiceNumber).toMatch(/^KC-/);
    expect(bought.direction).toBe("payable");
  });

  it("signs a sale as owed to the Company and a purchase as owed to the party", async () => {
    const world = await partyWorld();
    await sale(world, 10_000_00);
    expect(
      await partyBalance(
        world.workspaceId,
        "other_party",
        world.otherPartyId,
        world.projectId,
      ),
    ).toBe(-10_000_00n);
    await purchase(world, 4_000_00);
    expect(
      await partyBalance(
        world.workspaceId,
        "other_party",
        world.otherPartyId,
        world.projectId,
      ),
    ).toBe(-6_000_00n);
  });

  it("allocates a Payment In only to the party's sales invoices", async () => {
    const world = await partyWorld();
    const invoice = await sale(world, 10_000_00);
    const bill = await purchase(world, 2_000_00);
    const wrong = await paymentIn(world, {
      amount: 1_000_00,
      allocations: [{ invoiceId: bill.id, amount: 1_000_00 }],
    });
    expect(await codeOf(wrong)).toBe("ALLOCATION_WRONG_DIRECTION");
    const tooMuch = await paymentIn(world, {
      amount: 20_000_00,
      allocations: [{ invoiceId: invoice.id, amount: 10_000_01 }],
    });
    expect(await codeOf(tooMuch)).toBe("ALLOCATION_EXCEEDS_BALANCE");

    const received = await paymentIn(world, {
      amount: 12_000_00,
      allocations: [{ invoiceId: invoice.id, amount: 10_000_00 }],
    });
    expect(received.status).toBe(StatusCodes.CREATED);
    expect(
      await json<{ allocated: number; unallocated: number }>(received),
    ).toMatchObject({ allocated: 10_000_00, unallocated: 2_000_00 });
    expect(await accountBalance(world.workspaceId, world.cashId)).toBe(
      12_000_00n,
    );
    // −10,000 sale + 2,000 bill + 12,000 received.
    expect(
      await partyBalance(
        world.workspaceId,
        "other_party",
        world.otherPartyId,
        world.projectId,
      ),
    ).toBe(4_000_00n);

    const out = await recordPayment(
      postTo("/party-payments", {
        partyType: "other_party",
        partyId: world.otherPartyId,
        projectId: world.projectId,
        paymentDate: TODAY,
        accountId: world.cashId,
        mode: "cash",
        amount: 500_00,
        allocations: [{ invoiceId: invoice.id, amount: 500_00 }],
      }),
    );
    expect(await codeOf(out)).toBe("ALLOCATION_WRONG_DIRECTION");
  });
});

describe("Settlement approval list (CM-708)", () => {
  it("moves settlements from pending to approved or rejected through the list", async () => {
    const world = await partyWorld();
    const first = await sale(world, 1_000_00);
    const second = await sale(world, 2_000_00);
    const third = await purchase(world, 3_000_00);
    await raise(first.id);
    await raise(second.id);
    await raise(third.id);
    const supplierBill = await json<Invoice>(
      await createInvoice(
        postTo("/invoices", {
          partyType: "supplier",
          partyId: world.supplierId,
          projectId: world.projectId,
          invoiceNumber: "S-1",
          invoiceDate: TODAY,
          amount: 100_00,
        }),
      ),
    );
    await raise(supplierBill.id);

    const pending = await settlementsOf(world, "pending");
    expect(pending).toHaveLength(3);
    expect(
      pending.every((item) => item.invoice.party.type === "other_party"),
    ).toBe(true);
    expect(pending[0]?.actions).toEqual({ approve: true, reject: true });
    expect(await settlementsOf(world, "pending", "supplier")).toHaveLength(1);

    const byInvoice = (id: string) =>
      pending.find((item) => item.invoice.id === id)?.id ?? "";
    const approved = await approveSettlement(
      postTo(`/settlements/${byInvoice(first.id)}/approve`, {}),
      idParams(byInvoice(first.id)),
    );
    expect(approved.status).toBe(StatusCodes.OK);
    // A sale written off adds back what the party owed.
    const writeOff = await prisma.constructionFinancePartyEntry.findFirst({
      where: { sourceType: "settlement", sourceId: byInvoice(first.id) },
    });
    expect(writeOff).toMatchObject({ kind: "write_off", amount: 1_000_00n });

    const rejected = await rejectSettlement(
      postTo(`/settlements/${byInvoice(second.id)}/reject`, {
        reason: "Collect it",
      }),
      idParams(byInvoice(second.id)),
    );
    expect(rejected.status).toBe(StatusCodes.OK);

    const again = await approveSettlement(
      postTo(`/settlements/${byInvoice(second.id)}/approve`, {}),
      idParams(byInvoice(second.id)),
    );
    expect(await codeOf(again)).toBe("SETTLEMENT_NOT_PENDING");

    const bulk = await bulkReject(
      postTo("/settlements/bulk-reject", {
        ids: [byInvoice(third.id)],
        reason: "Not agreed",
      }),
    );
    expect(bulk.status).toBe(StatusCodes.OK);

    expect(await settlementsOf(world, "pending")).toHaveLength(0);
    expect(
      (await settlementsOf(world, "approved")).map((item) => item.invoice.id),
    ).toEqual([first.id]);
    expect(
      (await settlementsOf(world, "rejected")).map((item) => item.invoice.id),
    ).toHaveLength(2);
  });

  it("lets only members with Approve decide, and lists only their Projects", async () => {
    const world = await partyWorld();
    const invoice = await sale(world, 1_000_00);
    await raise(invoice.id);
    const reader = await partiesMember(world, ["read"]);
    actAs(reader);
    const [item] = await settlementsOf(world, "pending");
    expect(item?.actions).toEqual({ approve: false, reject: false });
    const refused = await approveSettlement(
      postTo(`/settlements/${item?.id ?? ""}/approve`, {}),
      idParams(item?.id ?? ""),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);

    const elsewhere = await partiesMember(world, ["read", "approve"], {
      onProject: false,
    });
    actAs(elsewhere);
    const all = await json<{ items: Settlement[] }>(
      await listSettlements(getFrom("/settlements", { status: "pending" })),
    );
    expect(all.items).toHaveLength(0);
  });
});

describe("Party Balance (CM-708)", () => {
  it("shows each Other Party across Projects, scoped to the member's Projects", async () => {
    const world = await partyWorld();
    await prisma.constructionFinanceOtherPartyProject.create({
      data: {
        otherPartyId: world.otherPartyId,
        projectId: world.otherProjectId,
      },
    });
    await sale(world, 10_000_00);
    await purchase(world, 3_000_00, world.otherProjectId);

    type Body = ListConstructionFinanceWorkspacePartyBalancesResponse;
    const owner = await json<Body>(
      await partyBalances(getFrom("/party-balances")),
    );
    const row = owner.items.find(
      (item) => item.party.id === world.otherPartyId,
    );
    expect(row?.balance).toBe(-7_000_00);
    expect(
      row?.projects.map((project) => [project.name, project.balance]),
    ).toEqual([
      ["Tower A", -10_000_00],
      ["Tower B", 3_000_00],
    ]);
    expect(owner.totals).toMatchObject({
      owedToCompany: 7_000_00,
      owedByCompany: 0,
      net: -7_000_00,
    });

    const member = await partiesMember(world, ["read"]);
    actAs(member);
    const scoped = await json<Body>(
      await partyBalances(getFrom("/party-balances")),
    );
    const mine = scoped.items.find(
      (item) => item.party.id === world.otherPartyId,
    );
    expect(mine?.balance).toBe(-10_000_00);
    expect(mine?.projects.map((project) => project.name)).toEqual(["Tower A"]);

    const outsider = await partiesMember(world, [], {
      extra: { "finance.transactions": ["read"] },
    });
    actAs(outsider);
    const refused = await partyBalances(getFrom("/party-balances"));
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });
});
