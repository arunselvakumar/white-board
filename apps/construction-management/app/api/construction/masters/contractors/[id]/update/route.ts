import { contractorRoutes } from "../../contractor-routes";

export const dynamic = "force-dynamic";

/** Changes a Contractor; carries the `updatedAt` it loaded (409 when stale). */
export const POST = contractorRoutes.update;
