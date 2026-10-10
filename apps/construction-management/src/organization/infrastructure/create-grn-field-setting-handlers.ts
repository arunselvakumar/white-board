import { prisma, type PrismaClient } from "@repo/construction-db";

import { GrnFieldSettingHandlers } from "../application/grn-field-setting-handlers";
import { PrismaGrnFieldSettingStore } from "./prisma-grn-field-setting-store";

export function createGrnFieldSettingHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  return new GrnFieldSettingHandlers(
    new PrismaGrnFieldSettingStore(deps?.prisma ?? prisma),
  );
}
