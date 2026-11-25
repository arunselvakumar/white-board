import { prisma, type PrismaClient } from "@repo/construction-db";

import { DepartmentHandlers } from "../application/department-handlers";
import { PrismaDepartmentRepository } from "./prisma-department-repository";

export function createDepartmentHandlers(deps?: { prisma?: PrismaClient }) {
  return new DepartmentHandlers(
    new PrismaDepartmentRepository(deps?.prisma ?? prisma),
  );
}
