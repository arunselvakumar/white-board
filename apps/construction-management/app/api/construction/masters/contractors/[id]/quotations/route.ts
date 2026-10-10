import { contractorQuotationRoutes } from "../../../_lib/quotation-handlers";

export const dynamic = "force-dynamic";

/** The party's quotation files, newest first (CM-501). */
export const GET = contractorQuotationRoutes.list;

/** Finishes an upload (step 3): records the file now at `key`. 201 new, 200 when already recorded. */
export const POST = contractorQuotationRoutes.complete;
