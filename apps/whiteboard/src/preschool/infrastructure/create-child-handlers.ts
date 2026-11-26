import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { ChildHandlers } from "../application/child-handlers";
import type {
  AdmissionInvoicer,
  ParentInviter,
} from "../application/child-ports";
import { createAdmissionInvoicer } from "./fee-admission-invoicer";
import { PrismaChildStore } from "./prisma-child-store";
import { WorkspaceParentInviter } from "./workspace-parent-inviter";

export function createChildHandlers(deps?: {
  prisma?: PrismaClient;
  invoicer?: AdmissionInvoicer;
  inviter?: ParentInviter;
  now?: () => Date;
}): ChildHandlers {
  const db = deps?.prisma ?? prisma;
  const store = new PrismaChildStore(db);
  return new ChildHandlers({
    store,
    reader: store,
    invoicer: deps?.invoicer ?? createAdmissionInvoicer({ prisma: db }),
    inviter: deps?.inviter ?? new WorkspaceParentInviter(),
    now: deps?.now ?? (() => new Date()),
  });
}
