import { randomUUID } from "node:crypto";

import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { CentreHandlers } from "../application/centre-handlers";
import { PrismaCentreStore } from "./prisma-centre-store";

export function createCentreHandlers(deps?: {
  prisma?: PrismaClient;
}): CentreHandlers {
  return new CentreHandlers({
    store: new PrismaCentreStore(deps?.prisma ?? prisma),
    newId: randomUUID,
  });
}
