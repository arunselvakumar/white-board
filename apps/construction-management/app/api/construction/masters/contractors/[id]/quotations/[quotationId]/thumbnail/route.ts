import { contractorQuotationRoutes } from "../../../../../_lib/quotation-handlers";

export const dynamic = "force-dynamic";

/** A quotation image's WebP thumbnail; 404 THUMBNAIL_NOT_FOUND without one. */
export const GET = contractorQuotationRoutes.readThumbnail;
