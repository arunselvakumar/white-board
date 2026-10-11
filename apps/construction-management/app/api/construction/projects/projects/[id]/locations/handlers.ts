import { prisma } from "@repo/construction-db";

import { PrismaStructureUsage } from "@/src/composition/structure-usage";
import { createLocationHandlers } from "@/src/projects/infrastructure/create-project-structure";

/**
 * One composition for the Location routes (CM-405). Locations named by site
 * records cannot be removed (ADR CM-0016 §7).
 */
export const locationHandlers = createLocationHandlers({
  usage: new PrismaStructureUsage(prisma),
});
