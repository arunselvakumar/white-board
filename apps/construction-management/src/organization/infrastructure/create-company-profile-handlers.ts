import { prisma, type PrismaClient } from "@repo/db";

import { GetCompanyProfileHandler } from "../application/get-company-profile";
import { PrismaCompanyProfileReader } from "./prisma-company-profile-reader";

export function createCompanyProfileHandlers(deps?: { prisma?: PrismaClient }) {
  const reader = new PrismaCompanyProfileReader(deps?.prisma ?? prisma);
  return { get: new GetCompanyProfileHandler(reader) };
}
