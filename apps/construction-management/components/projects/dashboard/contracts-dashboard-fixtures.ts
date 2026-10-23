import type { ContractsDashboard } from "@/src/queries/contracts-dashboard";

export const CONTRACTS_DASHBOARD_PATH = "/api/construction/contracts/dashboard";

/**
 * A contract-work Project billed both ways (CM-1111): ₹21.47 lakh billed
 * of a ₹85 lakh BOQ, receivable and payable after part payments,
 * retention held each way, two bills pending and three Work Orders open.
 */
export function contractsDashboard(projectId: string): ContractsDashboard {
  return {
    projectId,
    boq: { value: 85_00_000_00 },
    client: {
      billedToDate: 21_47_500_00,
      outstanding: 6_12_480_00,
      retentionHeld: 1_07_375_00,
      pendingApproval: 1,
    },
    contractor: {
      billedToDate: 14_20_000_00,
      outstanding: 2_35_600_00,
      retentionHeld: 71_000_00,
      pendingApproval: 1,
    },
    workOrders: { open: 3 },
  };
}

/** A member with Contractor Bills read only, without Financial. */
export function contractorOnlyDashboard(projectId: string): ContractsDashboard {
  return {
    projectId,
    boq: null,
    client: null,
    contractor: {
      billedToDate: null,
      outstanding: null,
      retentionHeld: null,
      pendingApproval: 2,
    },
    workOrders: null,
  };
}

/** No contracts menu at all. */
export function noContractsDashboard(projectId: string): ContractsDashboard {
  return {
    projectId,
    boq: null,
    client: null,
    contractor: null,
    workOrders: null,
  };
}
