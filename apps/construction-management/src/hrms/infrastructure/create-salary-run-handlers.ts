import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import type { HrmsPorts } from "./create-hrms-ports";
import { createHrmsPorts } from "./create-hrms-ports";
import { SalaryRunHandlers } from "../application/salary-run-handlers";
import { StatutoryReturnHandlers } from "../application/statutory-return-handlers";
import { pdfPayslipRenderer } from "./payslip-pdf";
import { PrismaEmployeeSalaryStore } from "./prisma-employee-salary-store";
import {
  PrismaPayslipFiles,
  PrismaSalaryCompanyReader,
} from "./prisma-payslip-files";
import { PrismaSalaryRunStore } from "./prisma-salary-run-store";

/**
 * Salary runs (CM-316) over Prisma. Day counts come from attendance
 * (`createHrmsPorts().attendanceDays`, which folds in approved leave,
 * holidays, week offs and each day's shift); tests may pass their own
 * `ports`.
 */
export function createSalaryRunHandlers(deps?: {
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  ports?: Partial<HrmsPorts>;
  clock?: () => Date;
}): SalaryRunHandlers {
  const db = deps?.prisma ?? prisma;
  const ports = { ...createHrmsPorts({ prisma: db }), ...deps?.ports };
  return new SalaryRunHandlers(
    new PrismaSalaryRunStore(db),
    {
      employees: ports.employees,
      settings: ports.settings,
      attendanceDays: ports.attendanceDays,
      statutoryRates: ports.statutoryRates,
      configs: new PrismaEmployeeSalaryStore(db),
      company: new PrismaSalaryCompanyReader(db),
      payslips: new PrismaPayslipFiles(db, deps?.storage ?? objectStorage()),
      renderer: pdfPayslipRenderer,
    },
    deps?.clock,
  );
}

/** PF and ESI exports of an approved month (CM-320) over Prisma. */
export function createStatutoryReturnHandlers(deps?: {
  prisma?: PrismaClient;
  clock?: () => Date;
}): StatutoryReturnHandlers {
  const db = deps?.prisma ?? prisma;
  return new StatutoryReturnHandlers(
    new PrismaSalaryRunStore(db),
    {
      company: new PrismaSalaryCompanyReader(db),
      configs: new PrismaEmployeeSalaryStore(db),
    },
    deps?.clock,
  );
}
