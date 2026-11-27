import { prisma, type PrismaClient } from "@repo/construction-db";

import { RoleHandlers } from "../application/role-handlers";
import { prismaRoleEmployees } from "./prisma-role-employees";
import { PrismaRoleRepository } from "./prisma-role-repository";

export function createRoleHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  return new RoleHandlers(
    new PrismaRoleRepository(db),
    () => new Date(),
    prismaRoleEmployees(db),
  );
}
