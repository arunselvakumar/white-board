import { workspaces } from "@repo/auth/server";
import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type { UserNames } from "../application/fee-dues-ports";
import { FeeDuesQueries } from "../application/fee-dues-queries";
import { FeeFollowUpHandlers } from "../application/fee-follow-up-handlers";
import { PrismaFeeDuesReader } from "./prisma-fee-dues-reader";
import { PrismaFeeFollowUpStore } from "./prisma-fee-follow-up-store";

export type FeeDuesHandlerSet = {
  commands: FeeFollowUpHandlers;
  queries: FeeDuesQueries;
};

/** Display names of the Users who logged Fee Follow-ups (ADR-0034). */
const workspaceUserNames: UserNames = {
  displayNames: (userIds) => workspaces.displayNames(userIds),
};

export function createFeeDuesHandlers(deps?: {
  prisma?: PrismaClient;
  names?: UserNames;
  now?: () => Date;
}): FeeDuesHandlerSet {
  const db = deps?.prisma ?? prisma;
  const now = deps?.now ?? (() => new Date());
  const queries = new FeeDuesQueries({
    reader: new PrismaFeeDuesReader(db),
    names: deps?.names ?? workspaceUserNames,
    now,
  });
  return {
    commands: new FeeFollowUpHandlers({
      store: new PrismaFeeFollowUpStore(db),
      queries,
      now,
      newId: () => crypto.randomUUID(),
    }),
    queries,
  };
}
