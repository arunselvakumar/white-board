import { contractorQuotationRoutes } from "../../../../_lib/quotation-handlers";

export const dynamic = "force-dynamic";

/** Streams one quotation: shown, or saved with `?download=1`. */
export const GET = contractorQuotationRoutes.read;
