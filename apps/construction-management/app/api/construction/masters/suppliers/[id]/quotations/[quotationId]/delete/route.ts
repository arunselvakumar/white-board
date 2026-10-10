import { supplierQuotationRoutes } from "../../../../../_lib/quotation-handlers";

export const dynamic = "force-dynamic";

/** Removes a quotation (a tombstone), then its file goes. */
export const POST = supplierQuotationRoutes.delete;
