import { prisma, type PrismaClient } from "@repo/construction-db";

import { EmployeeSalaryHandlers } from "../application/employee-salary-handlers";
import { SalaryStructureHandlers } from "../application/salary-structure-handlers";
import { PrismaEmployeeDirectory } from "./prisma-directories";
import { PrismaEmployeeSalaryStore } from "./prisma-employee-salary-store";
import { PrismaHrmsSettingsStore } from "./prisma-hrms-settings-store";
import { PrismaSalaryStructureStore } from "./prisma-salary-structure-store";
import { PrismaStatutoryRates } from "./prisma-statutory-rates";

/** Salary structures (CM-314). */
export function createSalaryStructureHandlers(deps?: {
  prisma?: PrismaClient;
}): SalaryStructureHandlers {
  const db = deps?.prisma ?? prisma;
  return new SalaryStructureHandlers(new PrismaSalaryStructureStore(db), {
    settings: new PrismaHrmsSettingsStore(db),
    statutoryRates: new PrismaStatutoryRates(db),
  });
}

/** Employee salary configuration (CM-315). */
export function createEmployeeSalaryHandlers(deps?: {
  prisma?: PrismaClient;
}): EmployeeSalaryHandlers {
  const db = deps?.prisma ?? prisma;
  return new EmployeeSalaryHandlers(new PrismaEmployeeSalaryStore(db), {
    employees: new PrismaEmployeeDirectory(db),
    structures: new PrismaSalaryStructureStore(db),
  });
}

/** The configuration in force per member, for the salary run (CM-316). */
export function createSalaryConfigSource(deps?: {
  prisma?: PrismaClient;
}): PrismaEmployeeSalaryStore {
  return new PrismaEmployeeSalaryStore(deps?.prisma ?? prisma);
}
