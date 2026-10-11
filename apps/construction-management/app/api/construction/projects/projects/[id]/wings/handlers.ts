import { prisma } from "@repo/construction-db";

import { PrismaStructureUsage } from "@/src/composition/structure-usage";
import { createWingHandlers } from "@/src/projects/infrastructure/create-project-structure";

/**
 * One composition for the Phase and Wing routes (CM-402). Floors, units and
 * Wings named by site records cannot be removed (ADR CM-0016 §7).
 */
export const wingHandlers = createWingHandlers({
  usage: new PrismaStructureUsage(prisma),
});
