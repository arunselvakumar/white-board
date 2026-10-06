import { prisma, type PrismaClient } from "@repo/db";

import { GetFamilyHomeHandler } from "../application/family-home";
import { PrismaClassExceptionsReader } from "./prisma-class-change-store";
import { PrismaFamilyHomeSource } from "./prisma-family-home-source";

export function createFamilyHomeHandler(
  db: PrismaClient = prisma,
): GetFamilyHomeHandler {
  return new GetFamilyHomeHandler(
    new PrismaFamilyHomeSource(db, new PrismaClassExceptionsReader(db)),
  );
}
