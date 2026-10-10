import type { PrismaClient } from "@repo/construction-db";

import { calendarDateFromDb } from "@/src/shared-kernel/calendar-date";

import type { StatutoryRates } from "../application/ports";
import { lastDayOf, type MonthKey } from "../domain/calendar";
import {
  ptFor,
  type EsiRate,
  type PfRate,
  type PtCharge,
  type PtGender,
} from "../domain/statutory";

type Db = Pick<
  PrismaClient,
  | "constructionHrmsStatutoryPfRate"
  | "constructionHrmsStatutoryEsiRate"
  | "constructionHrmsStatutoryPtSlab"
>;

function monthEnd(month: MonthKey): Date {
  return new Date(`${lastDayOf(month)}T00:00:00.000Z`);
}

/** The platform-wide statutory tables (ADR CM-0008), read per call. */
export class PrismaStatutoryRates implements StatutoryRates {
  constructor(private readonly db: Db) {}

  async pfFor(month: MonthKey): Promise<PfRate | null> {
    const row = await this.db.constructionHrmsStatutoryPfRate.findFirst({
      where: { effectiveFrom: { lte: monthEnd(month) } },
      orderBy: { effectiveFrom: "desc" },
    });
    if (row == null) return null;
    return {
      effectiveFrom: calendarDateFromDb(row.effectiveFrom),
      wageCeiling: row.wageCeiling,
      employeePercent: row.employeePercent.toFixed(2),
      employerPercent: row.employerPercent.toFixed(2),
      epsPercent: row.epsPercent.toFixed(2),
      source: row.source,
    };
  }

  async esiFor(month: MonthKey): Promise<EsiRate | null> {
    const row = await this.db.constructionHrmsStatutoryEsiRate.findFirst({
      where: { effectiveFrom: { lte: monthEnd(month) } },
      orderBy: { effectiveFrom: "desc" },
    });
    if (row == null) return null;
    return {
      effectiveFrom: calendarDateFromDb(row.effectiveFrom),
      wageCeiling: row.wageCeiling,
      pwdWageCeiling: row.pwdWageCeiling,
      employeePercent: row.employeePercent.toFixed(2),
      employerPercent: row.employerPercent.toFixed(2),
      source: row.source,
    };
  }

  async ptFor(
    stateCode: string,
    month: MonthKey,
    gross: number,
    gender?: PtGender,
  ): Promise<PtCharge> {
    const rows = await this.db.constructionHrmsStatutoryPtSlab.findMany({
      where: { stateCode, effectiveFrom: { lte: monthEnd(month) } },
    });
    return ptFor(
      rows.map((row) => ({
        stateCode: row.stateCode,
        effectiveFrom: calendarDateFromDb(row.effectiveFrom),
        appliesTo: row.appliesTo,
        grossFrom: row.grossFrom,
        grossTo: row.grossTo,
        monthlyAmount: row.monthlyAmount,
        specialMonth: row.specialMonth,
        specialMonthAmount: row.specialMonthAmount,
        source: row.source,
      })),
      { stateCode, month, gross, gender },
    );
  }
}
