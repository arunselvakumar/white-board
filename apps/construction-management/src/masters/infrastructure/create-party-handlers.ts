import { prisma, type PrismaClient } from "@repo/construction-db";

import { PartyHandlers } from "../application/party-handlers";
import type { PartyKind } from "../domain/party";
import { PrismaPartyDirectory, PrismaPartyStore } from "./prisma-party-store";

/** Contractors (`contractor`) or Suppliers (`supplier`), CM-406. */
export function createPartyHandlers(
  kind: PartyKind,
  deps?: { prisma?: PrismaClient },
) {
  const db = deps?.prisma ?? prisma;
  return new PartyHandlers(
    kind,
    new PrismaPartyStore(db),
    new PrismaPartyDirectory(db),
  );
}
