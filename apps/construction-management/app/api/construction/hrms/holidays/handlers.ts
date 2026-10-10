import { createHolidayHandlers } from "@/src/hrms/infrastructure/create-hrms-ports";

/** One composition for every Holidays route (CM-305). */
export const holidays = createHolidayHandlers();
