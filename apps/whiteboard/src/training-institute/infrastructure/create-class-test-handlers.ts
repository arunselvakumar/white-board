import { prisma, type PrismaClient } from "@repo/db";

import { ClassTestHandlers } from "../application/class-test-handlers";
import { PrismaClassTestStore } from "./prisma-class-test-store";

export function createClassTestHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): ClassTestHandlers {
  return new ClassTestHandlers({
    store: new PrismaClassTestStore(deps?.prisma ?? prisma),
    now: deps?.now ?? (() => new Date()),
  });
}
