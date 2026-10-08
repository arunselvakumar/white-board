import { prisma, type PrismaClient } from "@repo/db";

import {
  InProcessEventDispatcher,
  type EventDispatcher,
} from "@/src/shared-kernel/events";

import type { CompanyDirectory } from "../application/company-directory";
import { CreateCompanyHandler } from "../application/create-company";
import { AuthCompanyDirectory } from "./auth-company-directory";
import { seedDesignations } from "./designation-seeds";
import { PrismaNewCompanyStore } from "./prisma-new-company-store";
import { PrismaTeamMemberRepository } from "./prisma-team-member-repository";
import { privateDataCipher } from "./private-data-cipher";

export function createCompanyHandlers(deps?: {
  prisma?: PrismaClient;
  directory?: CompanyDirectory;
  events?: EventDispatcher;
}) {
  const db = deps?.prisma ?? prisma;
  return {
    create: new CreateCompanyHandler(
      deps?.directory ?? new AuthCompanyDirectory(),
      new PrismaNewCompanyStore(
        db,
        new PrismaTeamMemberRepository(db, privateDataCipher),
      ),
      seedDesignations,
      deps?.events ?? new InProcessEventDispatcher(),
    ),
  };
}
