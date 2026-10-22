import { clientBillRoute } from "../client-bill-route";

export const dynamic = "force-dynamic";

/**
 * One Client Bill (CM-1107): the abstract with the measurement rows behind
 * each line and its deviation marks, deductions, the tax invoice's GSTINs,
 * place of supply and GST, the net receivable, the retention suggestion
 * and the invoice once approved. Money is null without Financial. Needs
 * Client Bill read.
 */
export const GET = clientBillRoute("read", () => Promise.resolve());
