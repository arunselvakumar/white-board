import { contractorQuotationRoutes } from "../../../../_lib/quotation-handlers";

export const dynamic = "force-dynamic";

/** Starts a quotation upload (step 1): checks the name, size, count and plan. */
export const POST = contractorQuotationRoutes.start;
