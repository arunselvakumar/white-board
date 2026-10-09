import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import type { CompanyNames } from "../application/company-directory";
import { CompanyImages } from "../application/company-images";
import { CompanyProfileHandlers } from "../application/company-profile-handlers";
import { AuthCompanyDirectory } from "./auth-company-directory";
import { PrismaCompanyProfileStore } from "./prisma-company-profile-store";

export function createCompanyProfileHandlers(deps?: {
  prisma?: PrismaClient;
  names?: CompanyNames;
  storage?: ObjectStorage;
}) {
  return new CompanyProfileHandlers(
    new PrismaCompanyProfileStore(deps?.prisma ?? prisma),
    deps?.names ?? new AuthCompanyDirectory(),
    new CompanyImages(deps?.storage ?? objectStorage()),
  );
}
