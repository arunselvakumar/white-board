import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { ChildHandlers } from "../application/child-handlers";
import type {
  AdmissionInvoicer,
  ParentInviter,
} from "../application/child-ports";
import { PrismaChildStore } from "./prisma-child-store";
import { WorkspaceParentInviter } from "./workspace-parent-inviter";

/** Raises nothing: Admissions get no Invoices until Fees are wired in here. */
const noInvoices: AdmissionInvoicer = {
  onAdmitted: () => Promise.resolve(),
};

export function createChildHandlers(deps?: {
  prisma?: PrismaClient;
  invoicer?: AdmissionInvoicer;
  inviter?: ParentInviter;
  now?: () => Date;
}): ChildHandlers {
  const store = new PrismaChildStore(deps?.prisma ?? prisma);
  return new ChildHandlers({
    store,
    reader: store,
    invoicer: deps?.invoicer ?? noInvoices,
    inviter: deps?.inviter ?? new WorkspaceParentInviter(),
    now: deps?.now ?? (() => new Date()),
  });
}
