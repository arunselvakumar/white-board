import { contractorRoutes } from "./contractor-routes";

export const dynamic = "force-dynamic";

/** Contractors, newest first, with search, active and Project filters. */
export const GET = contractorRoutes.list;

/** Adds a Contractor. 409 when a live one has the name. */
export const POST = contractorRoutes.create;
