import { prisma, type PrismaClient } from "@repo/construction-db";

import { RoleHandlers } from "../application/role-handlers";
import { PrismaRoleRepository } from "./prisma-role-repository";

export function createRoleHandlers(deps?: { prisma?: PrismaClient }) {
  return new RoleHandlers(new PrismaRoleRepository(deps?.prisma ?? prisma));
}
