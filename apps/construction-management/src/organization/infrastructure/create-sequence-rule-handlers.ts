import { prisma, type PrismaClient } from "@repo/construction-db";

import { SequenceRuleHandlers } from "../application/sequence-rule-handlers";
import { PrismaSequenceRuleStore } from "./prisma-sequence-rule-store";

export function createSequenceRuleHandlers(deps?: { prisma?: PrismaClient }) {
  return new SequenceRuleHandlers(
    new PrismaSequenceRuleStore(deps?.prisma ?? prisma),
  );
}
