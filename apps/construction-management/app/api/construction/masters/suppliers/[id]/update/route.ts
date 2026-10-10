import { supplierRoutes } from "../../supplier-routes";

export const dynamic = "force-dynamic";

/** Changes a Supplier; carries the `updatedAt` it loaded (409 when stale). */
export const POST = supplierRoutes.update;
