import { createAttendanceHandlers } from "@/src/hrms/infrastructure/create-hrms-ports";

/** One composition for every attendance route (CM-308, CM-309). */
export const attendance = createAttendanceHandlers();
