import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { ClassChangeHandlers } from "../application/class-change-handlers";
import {
  PrismaClassChangeStore,
  PrismaClassExceptionsReader,
} from "./prisma-class-change-store";

export function createClassChangeHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): ClassChangeHandlers {
  return new ClassChangeHandlers({
    store: new PrismaClassChangeStore(deps?.prisma ?? prisma),
    now: deps?.now ?? (() => new Date()),
  });
}

export function createClassExceptionsReader(
  db: PrismaClient = prisma,
): PrismaClassExceptionsReader {
  return new PrismaClassExceptionsReader(db);
}
