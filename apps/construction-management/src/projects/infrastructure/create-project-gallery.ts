import { prisma, type PrismaClient } from "@repo/construction-db";

import { ProjectGallery } from "../application/project-gallery";
import { PrismaGalleryReader } from "./prisma-gallery-reader";
import { PrismaProjectRepository } from "./prisma-project-repository";
import { PrismaUploaderNames } from "./prisma-uploader-names";

/** The Gallery's composition (CM-410). */
export function createProjectGallery(
  db: PrismaClient = prisma,
): ProjectGallery {
  return new ProjectGallery(
    new PrismaProjectRepository(db),
    new PrismaGalleryReader(db),
    new PrismaUploaderNames(db),
  );
}
