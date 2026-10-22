import { contractorBillRoute } from "../contractor-bill-route";

export const dynamic = "force-dynamic";

/**
 * One Contractor Bill (CM-1106): the abstract with the measurement rows
 * behind each line, deductions, GST and net, the retention suggestion,
 * the TDS estimate and the invoice once approved. Money is null without
 * Financial. Needs Contractor Bill read.
 */
export const GET = contractorBillRoute("read", () => Promise.resolve());
