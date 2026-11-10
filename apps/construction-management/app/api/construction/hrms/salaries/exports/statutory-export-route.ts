import { createStatutoryReturnHandlers } from "@/src/hrms/infrastructure/create-salary-run-handlers";

/** PF and ESI export handlers, wired once for both routes. */
export const statutoryReturns = createStatutoryReturnHandlers();
