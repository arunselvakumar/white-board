import { contractorRoutes } from "../../contractor-routes";

export const dynamic = "force-dynamic";

/** Deletes a Contractor (a tombstone); 409 while they are on a live Project. */
export const POST = contractorRoutes.delete;
