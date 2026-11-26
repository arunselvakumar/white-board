import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { EnquiryHandlers } from "../application/enquiry-handlers";
import { PrismaEnquiryStore } from "./prisma-enquiry-store";

export function createEnquiryHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): EnquiryHandlers {
  const store = new PrismaEnquiryStore(deps?.prisma ?? prisma);
  return new EnquiryHandlers({
    store,
    reader: store,
    now: deps?.now ?? (() => new Date()),
  });
}
