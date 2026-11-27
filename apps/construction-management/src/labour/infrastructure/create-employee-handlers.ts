import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import { LabourHandlers } from "../application/labour-handlers";
import { LabourImport } from "../application/labour-import";
import { PartyFiles } from "../application/party-files";
import { PrismaDirectories } from "./prisma-directories";
import {
  PrismaLabourQueries,
  prismaLabourLookups,
} from "./prisma-labour-queries";
import { PrismaLabourRepository } from "./prisma-labour-repository";
import { PrismaPartyFilesStore } from "./prisma-party-files-store";
import { privateDataCipher } from "./private-data-cipher";

/** The Labour register (CM-205, CM-206) over Prisma. */
export function createLabourHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  const repository = new PrismaLabourRepository(db, privateDataCipher);
  const queries = new PrismaLabourQueries(db);
  return {
    labours: new LabourHandlers(repository, queries, new PrismaDirectories(db)),
    importer: new LabourImport(repository, prismaLabourLookups(queries)),
    lookups: prismaLabourLookups(queries),
  };
}

/**
 * Photos and "Other Documents" of labourers and vendors (CM-205, CM-208);
 * pass `ownerType` on each call.
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
