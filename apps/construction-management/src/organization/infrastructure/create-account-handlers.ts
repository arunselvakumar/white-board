import { prisma, type PrismaClient } from "@repo/construction-db";

import { verifyActionCode } from "@/src/shared-kernel/action-codes";

import { AccountDeletionHandlers } from "../application/account-deletion-handlers";
import { CompanyDeletionHandlers } from "../application/company-deletion-handlers";
import {
  DeviceHandlers,
  type PushSessions,
} from "../application/device-handlers";
import { OwnershipHandlers } from "../application/ownership-handlers";
import {
  authAccountCompanies,
  authSessionDirectory,
} from "./auth-account-directories";
import {
  PrismaAccountDeletionStore,
  type AccountErasureHook,
} from "./prisma-account-deletion-store";
import { PrismaCompanyDeletionStore } from "./prisma-company-deletion-store";
import { PrismaCompanyProfileReader } from "./prisma-company-profile-reader";
import { PrismaDesignationRepository } from "./prisma-designation-repository";
import { PrismaOwnershipTransferStore } from "./prisma-ownership-transfer-store";
import { PrismaRoleRepository } from "./prisma-role-repository";
import { PrismaTeamMemberRepository } from "./prisma-team-member-repository";
import { privateDataCipher } from "./private-data-cipher";

/** My Profile → Devices (CM-907); push comes from the composition root. */
export function createDeviceHandlers(deps: { push: PushSessions }) {
  return new DeviceHandlers(authSessionDirectory, deps.push);
}

/** Transfer ownership (CM-907). */
export function createOwnershipHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  const members = new PrismaTeamMemberRepository(db, privateDataCipher);
  const roles = new PrismaRoleRepository(db);
  return new OwnershipHandlers(
    members,
    new PrismaDesignationRepository(db),
    roles,
    new PrismaOwnershipTransferStore(db, members, roles),
    verifyActionCode,
  );
}

/** Delete My Account (CM-907); messaging's clean-up comes as `hooks`. */
export function createAccountDeletionHandlers(deps: {
  prisma?: PrismaClient;
  hooks: readonly AccountErasureHook[];
}) {
  const db = deps.prisma ?? prisma;
  const members = new PrismaTeamMemberRepository(db, privateDataCipher);
  return new AccountDeletionHandlers(
    authAccountCompanies,
    members,
    new PrismaAccountDeletionStore(db, members, deps.hooks),
    verifyActionCode,
  );
}

/** Delete Company and Cancel deletion (CM-907). */
export function createCompanyDeletionHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  const db = deps?.prisma ?? prisma;
  return new CompanyDeletionHandlers(
    new PrismaCompanyDeletionStore(db),
    new PrismaCompanyProfileReader(db),
    verifyActionCode,
  );
}
