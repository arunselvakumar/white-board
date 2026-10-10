import { createBranchHandlers } from "@/src/hrms/infrastructure/create-hrms-ports";

/** One composition for every Branches & Sites route (CM-304). */
export const branches = createBranchHandlers();
