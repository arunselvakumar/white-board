import { prisma, type PrismaClient } from "@repo/construction-db";

import { ProjectMediaListener } from "../application/project-media-listener";
import { PrismaProjectMediaStore } from "./prisma-media-index";

/** The Gallery index's listener for other contexts' files (ADR CM-0014). */
export function createProjectMediaListener(
  db: PrismaClient = prisma,
): ProjectMediaListener {
  return new ProjectMediaListener(new PrismaProjectMediaStore(db));
}
