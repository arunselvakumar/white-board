import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import { accountOptionsHandler } from "@/components/finance/account-fixtures";
import type { AdvancesRetention } from "@/src/queries/contracts-advances";

export const PROJECT = "0199c0de-1108-7000-8000-000000000001";
export const WORK_ORDER = "0199c0de-1108-7000-8000-0000000000e1";
export const CONTRACTOR = "0199c0de-1108-7000-8000-0000000000c1";
export const CLIENT = "0199c0de-1108-7000-8000-0000000000c2";
export const ADVANCE = "0199c0de-1108-7000-8000-0000000000a1";
export const BG_RETENTION = "0199c0de-1108-7000-8000-0000000000b1";
export const BG_ADVANCE = "0199c0de-1108-7000-8000-0000000000b2";
export const RELEASE = "0199c0de-1108-7000-8000-0000000000d1";
export const TODAY = "2026-10-22";

export const CONTRACTS_API = "/api/construction/contracts";

/**
 * A Work Order with a ₹1,00,000 mobilisation advance given (₹40,000
 * recovered by one bill), ₹20,000 retention deducted and half released on
 * completion, a retention guarantee expiring in 12 days and an advance
 * guarantee, and a DLP of 12 months from 12 Oct 2026.
 */
export function contractorView(
  patch: Partial<AdvancesRetention> = {},
): AdvancesRetention {
  return {
    side: "contractor",
    projectId: PROJECT,
    workOrderId: WORK_ORDER,
    workOrderNumber: "WO/26-27/00001",
    workOrderStatus: "issued",
    party: { id: CONTRACTOR, name: "Velan Constructions" },
    advances: [
      {
        id: ADVANCE,
        direction: "given",
        kind: "mobilisation",
        amount: 1_00_000_00,
        advanceOn: "2026-09-01",
        recoveryMode: "percent",
        recoveryPercent: "10.00",
        recoveryAmount: null,
        payment: {
          id: "0199c0de-1108-7000-8000-0000000000f1",
          number: "PAY/26-27/00004",
        },
        recovered: 40_000_00,
        balance: 60_000_00,
        remarks: "Site set-up",
        guaranteeIds: [BG_ADVANCE],
        updatedAt: "2026-09-01T06:00:00.000Z",
      },
    ],
    advanceTotals: {
      amount: 1_00_000_00,
      recovered: 40_000_00,
      balance: 60_000_00,
    },
    agreedMobilisation: 1_00_000_00,
    defaultRecoveryPercent: "10.00",
    warnings: [],
    retention: {
      percent: "5.00",
      completionPercent: "50.00",
      deducted: 20_000_00,
      released: 10_000_00,
      releasable: 10_000_00,
      completionSuggestion: 0,
      dlpEndSuggestion: 10_000_00,
    },
    releases: [
      {
        id: RELEASE,
        stage: "completion",
        amount: 10_000_00,
        releasedOn: "2026-10-15",
        reason: null,
        bankGuarantee: null,
        invoice: {
          id: "0199c0de-1108-7000-8000-0000000000f2",
          number: "WO/26-27/00001/RET-1",
        },
        settled: false,
        createdAt: "2026-10-15T06:00:00.000Z",
        createdByName: "Meena Raghavan",
      },
    ],
    guarantees: [
      {
        id: BG_RETENTION,
        purpose: "retention",
        number: "BG/2026/118",
        bank: "State Bank of India",
        amount: 10_000_00,
        issuedOn: "2026-10-01",
        expiresOn: "2026-11-03",
        releasedOn: null,
        status: "live",
        daysToExpiry: 12,
        advanceId: null,
        remarks: null,
        updatedAt: "2026-10-01T06:00:00.000Z",
      },
      {
        id: BG_ADVANCE,
        purpose: "advance",
        number: "BG/2026/090",
        bank: "Indian Bank",
        amount: 1_00_000_00,
        issuedOn: "2026-08-25",
        expiresOn: "2027-08-24",
        releasedOn: null,
        status: "live",
        daysToExpiry: 306,
        advanceId: ADVANCE,
        remarks: null,
        updatedAt: "2026-08-25T06:00:00.000Z",
      },
    ],
    dlp: {
      startsOn: "2026-10-12",
      months: 12,
      endsOn: "2027-10-12",
      daysLeft: 355,
      ended: false,
    },
    allowed: {
      recordAdvance: true,
      update: true,
      delete: true,
      releaseEarly: true,
      setCompletion: true,
    },
    financial: true,
    viewerFlags: ["read", "update", "delete", "approve", "financial"],
    today: TODAY,
    ...patch,
  };
}

/** The client contract: an advance received, nothing released, handover not yet recorded. */
export function clientView(
  patch: Partial<AdvancesRetention> = {},
): AdvancesRetention {
  const base = contractorView();
  return {
    ...base,
    side: "client",
    workOrderId: null,
    workOrderNumber: null,
    workOrderStatus: null,
    party: { id: CLIENT, name: "Tamil Nadu Housing Board" },
    advances: base.advances.map((advance) => ({
      ...advance,
      direction: "received",
      guaranteeIds: [],
      payment: {
        id: "0199c0de-1108-7000-8000-0000000000f3",
        number: "PAY/26-27/00009",
      },
    })),
    agreedMobilisation: null,
    defaultRecoveryPercent: null,
    retention: {
      percent: "5.00",
      completionPercent: "50.00",
      deducted: 20_000_00,
      released: 0,
      releasable: 20_000_00,
      completionSuggestion: 10_000_00,
      dlpEndSuggestion: 20_000_00,
    },
    releases: [],
    guarantees: [],
    dlp: {
      startsOn: null,
      months: 12,
      endsOn: null,
      daysLeft: null,
      ended: false,
    },
    allowed: { ...base.allowed, setCompletion: false },
    ...patch,
  };
}

/** Money hidden: a Team Member without Financial. */
export function withoutFinancial(view: AdvancesRetention): AdvancesRetention {
  return {
    ...view,
    financial: false,
    advances: view.advances.map((advance) => ({
      ...advance,
      amount: null,
      recoveryAmount: null,
      recovered: null,
      balance: null,
    })),
    advanceTotals: { amount: null, recovered: null, balance: null },
    agreedMobilisation: null,
    warnings: [],
    retention: {
      ...view.retention,
      deducted: null,
      released: null,
      releasable: null,
      completionSuggestion: null,
      dlpEndSuggestion: null,
    },
    releases: view.releases.map((release) => ({ ...release, amount: null })),
    guarantees: view.guarantees.map((row) => ({ ...row, amount: null })),
    allowed: {
      recordAdvance: false,
      update: false,
      delete: false,
      releaseEarly: false,
      setCompletion: false,
    },
    viewerFlags: ["read"],
  };
}

export type AdvancesStoryApi = ReturnType<typeof mockApi>;

/**
 * The advances read for stories, the account picker's options, and every
 * POST answered with `after` (by default the view as it was).
 */
export function serveAdvances(
  view: AdvancesRetention,
  after?: (call: ApiCall) => AdvancesRetention,
) {
  const holder: { current: AdvancesStoryApi | null } = { current: null };
  const beforeEach = () => {
    const api = mockApi((call) => {
      if (call.method === "POST")
        return Response.json(after?.(call) ?? view, { status: 200 });
      const accounts = accountOptionsHandler(call);
      if (accounts != null) return accounts;
      if (call.path.includes("/advances-retention")) return Response.json(view);
      return undefined;
    });
    holder.current = api;
    return api.restore;
  };
  return { beforeEach, holder };
}

/** The body of the last POST to `path`. */
export function posted(api: AdvancesStoryApi | null, path: string): unknown {
  return api?.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path)
    .at(-1)?.body;
}
