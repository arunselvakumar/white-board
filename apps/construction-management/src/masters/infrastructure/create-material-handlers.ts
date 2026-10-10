import { prisma, type PrismaClient } from "@repo/construction-db";

import {
  MaterialCategoryHandlers,
  MaterialHandlers,
  MeasurementUnitHandlers,
  TermsConditionHandlers,
} from "../application/material-master-handlers";
import type { MaterialUsage } from "../application/material-ports";
import {
  PrismaMaterialCategoryStore,
  PrismaMaterialStore,
  PrismaMeasurementUnitStore,
  PrismaTermsConditionStore,
} from "./prisma-material-master-stores";

/** Measurement Units (CM-501). */
export function createMeasurementUnitHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  return new MeasurementUnitHandlers(
    new PrismaMeasurementUnitStore(deps?.prisma ?? prisma),
  );
}

/** Material Categories (CM-501). */
export function createMaterialCategoryHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  return new MaterialCategoryHandlers(
    new PrismaMaterialCategoryStore(deps?.prisma ?? prisma),
  );
}

/**
 * Materials (CM-501). `usage` says whether procurement points at one; the
 * routes pass `src/composition`'s, which reads procurement's tables.
 */
export function createMaterialHandlers(deps?: {
  prisma?: PrismaClient;
  usage?: MaterialUsage;
}) {
  return new MaterialHandlers(
    new PrismaMaterialStore(deps?.prisma ?? prisma),
    () => new Date(),
    deps?.usage,
  );
}

/** Terms & Conditions (CM-501). */
export function createTermsConditionHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  return new TermsConditionHandlers(
    new PrismaTermsConditionStore(deps?.prisma ?? prisma),
  );
}
