import { prisma, type PrismaClient } from "@repo/db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import { CompanyImages } from "../application/company-images";
import { MyProfileHandlers } from "../application/my-profile-handlers";
import { PrismaDesignationRepository } from "./prisma-designation-repository";
import { PrismaMemberPhotoStore } from "./prisma-member-photo-store";
import { PrismaTeamMemberRepository } from "./prisma-team-member-repository";
import { privateDataCipher } from "./private-data-cipher";

export function createMyProfileHandlers(deps?: {
  prisma?: PrismaClient;
  storage?: ObjectStorage;
}) {
  const db = deps?.prisma ?? prisma;
  return new MyProfileHandlers(
    new PrismaTeamMemberRepository(db, privateDataCipher),
    new PrismaDesignationRepository(db),
    new PrismaMemberPhotoStore(db),
    new CompanyImages(deps?.storage ?? objectStorage()),
  );
}
