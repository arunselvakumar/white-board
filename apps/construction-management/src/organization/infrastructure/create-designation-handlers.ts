import { prisma, type PrismaClient } from "@repo/db";

import { DesignationHandlers } from "../application/designation-handlers";
import { PrismaDesignationRepository } from "./prisma-designation-repository";

export function createDesignationHandlers(deps?: { prisma?: PrismaClient }) {
  return new DesignationHandlers(
    new PrismaDesignationRepository(deps?.prisma ?? prisma),
  );
}
