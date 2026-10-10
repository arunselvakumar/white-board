import { supplierRoutes } from "../../supplier-routes";

export const dynamic = "force-dynamic";

/** Deletes a Supplier (a tombstone); 409 while they are on a live Project. */
export const POST = supplierRoutes.delete;
