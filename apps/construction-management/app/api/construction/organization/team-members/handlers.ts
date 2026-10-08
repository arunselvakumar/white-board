import { prisma } from "@repo/db";

import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import { PrismaProjectDirectory } from "@/src/organization/infrastructure/prisma-project-directory";

/** One composition for every Team Member route. */
export const teamMemberHandlers = createTeamMemberHandlers();

/** The Company's live Projects, to check assignments against (CM-204). */
export const projectDirectory = new PrismaProjectDirectory(prisma);
