import { contractorQuotationRoutes } from "../../../../../_lib/quotation-handlers";

export const dynamic = "force-dynamic";

/** Step 2, deployed: `uploadPresigned()`'s `handleUploadUrl`. 404 with files on disk. */
export const POST = contractorQuotationRoutes.presign;
