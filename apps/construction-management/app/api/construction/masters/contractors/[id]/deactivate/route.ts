import { contractorRoutes } from "../../contractor-routes";

export const dynamic = "force-dynamic";

/** Takes a Contractor off the pickers; they stay on their Projects. */
export const POST = contractorRoutes.deactivate;
