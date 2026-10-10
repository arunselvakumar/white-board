import { supplierRoutes } from "./supplier-routes";

export const dynamic = "force-dynamic";

/** Suppliers, newest first, with search, active and Project filters. */
export const GET = supplierRoutes.list;

/** Adds a Supplier. 409 when a live one has the name. */
export const POST = supplierRoutes.create;
