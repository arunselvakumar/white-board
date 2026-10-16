import { messagingEvents } from "@/src/composition/messaging";
import { createAttendanceHandlers } from "@/src/hrms/infrastructure/create-hrms-ports";

/** One composition for every attendance route (CM-308, CM-309). */
export const attendance = createAttendanceHandlers({
  events: messagingEvents(),
});
