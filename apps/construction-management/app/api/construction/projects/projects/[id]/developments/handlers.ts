import { createProjectDevelopmentHandlers } from "@/src/masters/infrastructure/create-masters-handlers";

/**
 * A Project's Amenities and Common Developments: the masters context
 * stores them, the projects context owns the Project. This route folder is
 * where the two meet (neither imports the other).
 */
export const projectDevelopments = createProjectDevelopmentHandlers();
