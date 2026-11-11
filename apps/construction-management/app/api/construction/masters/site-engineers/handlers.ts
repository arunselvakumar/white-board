import { prisma } from "@repo/construction-db";

import { createSiteEngineerHandlers } from "@/src/composition/site-engineers";
import { PrismaProjectDirectory } from "@/src/organization/infrastructure/prisma-project-directory";

/** One composition for every Site Engineer route (ADR CM-0037). */
export const siteEngineerHandlers = createSiteEngineerHandlers();

/** The Company's live Projects, to check assignments against. */
export const projectDirectory = new PrismaProjectDirectory(prisma);
