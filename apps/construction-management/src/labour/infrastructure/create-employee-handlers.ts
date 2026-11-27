import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import { EmployeeHandlers } from "../application/employee-handlers";
import { EmployeeImport } from "../application/employee-import";
import { PartyFiles } from "../application/party-files";
import { PrismaDirectories } from "./prisma-directories";
import {
  PrismaEmployeeQueries,
  prismaEmployeeLookups,
} from "./prisma-employee-queries";
import { PrismaEmployeeRepository } from "./prisma-employee-repository";
import { PrismaPartyFilesStore } from "./prisma-party-files-store";
import { privateDataCipher } from "./private-data-cipher";

/** The Employee record (ADR CM-0055) over Prisma. */
export function createEmployeeHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  const repository = new PrismaEmployeeRepository(db, privateDataCipher);
  const queries = new PrismaEmployeeQueries(db);
  const lookups = prismaEmployeeLookups(queries);
  return {
    employees: new EmployeeHandlers(
      repository,
      queries,
      new PrismaDirectories(db),
    ),
    importer: new EmployeeImport(repository, lookups),
    lookups,
  };
}

/**
 * Photos and "Other Documents" of Employees and vendors (CM-205, CM-208,
 * ADR CM-0055); pass `ownerType` on each call.
 */
export function createPartyFiles(deps?: {
  prisma?: PrismaClient;
  storage?: ObjectStorage;
}): PartyFiles {
  return new PartyFiles(
    deps?.storage ?? objectStorage(),
    new PrismaPartyFilesStore(deps?.prisma ?? prisma),
  );
}
