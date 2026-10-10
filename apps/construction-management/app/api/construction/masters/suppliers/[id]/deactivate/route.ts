import { supplierRoutes } from "../../supplier-routes";

export const dynamic = "force-dynamic";

/** Takes a Supplier off the pickers; they stay on their Projects. */
export const POST = supplierRoutes.deactivate;
