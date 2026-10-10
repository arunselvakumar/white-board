import { createShiftTemplateHandlers } from "@/src/hrms/infrastructure/create-hrms-ports";

/** One composition for every shift and rotation template route (CM-306). */
export const templates = createShiftTemplateHandlers();
