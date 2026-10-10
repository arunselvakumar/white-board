import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";

import { assertMonthKey, type MonthKey } from "../domain/calendar";
import {
  buildEcrReturn,
  buildEsiReturn,
  type EcrReturn,
  type EsiReturn,
  type StatutoryReturnSlip,
} from "../domain/statutory-returns";
import type { SalaryConfigSource } from "./employee-salary-handlers";
import type {
  SalaryCompanyReader,
  SalaryRunStore,
  StoredSalarySlip,
} from "./salary-run-ports";

const MENU = "hrms.salaries" as const;

type Snapshot = Record<string, unknown>;

function part(snapshot: Snapshot, key: string): Snapshot {
  const value = snapshot[key];
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Snapshot)
    : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** A stored regular slip as the PF and ESI returns read it. */
export function statutoryReturnSlipOf(
  slip: StoredSalarySlip,
): StatutoryReturnSlip {
  const pf = part(slip.statutorySnapshot, "pf");
  const esi = part(slip.statutorySnapshot, "esi");
  const details = slip.details;
  return {
    memberId: slip.memberId,
    name: details?.employee.name ?? "Team Member",
    uan: details?.employee.uan ?? null,
    esiIpNumber: details?.employee.esiIpNumber ?? null,
    daysInMonth: slip.days.daysInMonth,
    payableDays: slip.days.payable,
    grossEarnings: slip.money.grossEarnings,
    pf: {
      applicable: pf["applicable"] === true && pf["rateEffectiveFrom"] != null,
      wage: details?.pfWages?.wage ?? null,
      contributoryWage: details?.pfWages?.contributory ?? null,
      tableWageCeiling: numberOrNull(pf["tableWageCeiling"]),
      employeePercent: stringOrNull(pf["employeePercent"]),
      epsPercent: stringOrNull(pf["epsPercent"]),
      employee: slip.money.pfEmployee,
      employerEpf: slip.money.pfEmployer,
      employerEps: slip.money.epsEmployer,
    },
    esi: {
      applicable:
        esi["applicable"] === true &&
        esi["eligible"] === true &&
        esi["rateEffectiveFrom"] != null,
      employee: slip.money.esiEmployee,
      employer: slip.money.esiEmployer,
    },
  };
}

export type StatutoryReturnHeader = {
  month: MonthKey;
  company: string;
  /** Company time. */
  generatedAt: string;
};

/**
 * PF (ECR) and ESI contribution exports of an approved salary month
 * (CM-320), menu `hrms.salaries` export and financial. Built from the
 * stored regular slips only, so the challan matches the approved
 * payslips; a month with a Calculated slip (or none) is refused.
 */
export class StatutoryReturnHandlers {
  constructor(
    private readonly store: Pick<SalaryRunStore, "listMonth" | "today">,
    private readonly deps: {
      company: SalaryCompanyReader;
      configs: SalaryConfigSource;
    },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private static monthOf(value: string): MonthKey {
    try {
      return assertMonthKey(value.trim());
    } catch {
      throw new DomainError("SALARY_MONTH_INVALID", "Choose a month.", {
        details: { field: "month" },
      });
    }
  }

  private async approvedSlips(
    access: MemberAccess,
    monthInput: string,
  ): Promise<{ header: StatutoryReturnHeader; slips: StatutoryReturnSlip[] }> {
    assertCan(access, MENU, "export");
    assertCan(access, MENU, "financial");
    const month = StatutoryReturnHandlers.monthOf(monthInput);
    const [slips, profile] = await Promise.all([
      this.store.listMonth(access.workspaceId, month),
      this.deps.company.profileFor(access.workspaceId),
    ]);
    const regular = slips.filter((slip) => slip.kind === "regular");
    const calculated = regular.filter(
      (slip) => slip.status === "calculated",
    ).length;
    if (regular.length === 0 || calculated > 0)
      throw conflict(
        "SALARY_MONTH_NOT_APPROVED",
        regular.length === 0
          ? "This month has no salaries yet. Calculate and approve them before exporting PF and ESI."
          : `Approve every salary of this month before exporting PF and ESI (${String(calculated)} still Calculated).`,
        { field: "month", calculated },
      );
    return {
      header: {
        month,
        company: profile.name,
        generatedAt: dateTimeIn(profile.timezone, this.clock()),
      },
      slips: await this.withCurrentNumbers(
        access.workspaceId,
        regular.map(statutoryReturnSlipOf),
      ),
    };
  }

  /**
   * The UAN and ESI IP number come from the slip (as at calculation); a
   * slip without one takes the member's current salary configuration's.
   * They are identifiers, not amounts, so adding one after approval (when
   * the slip can no longer be recalculated) still reaches the export.
   */
  private async withCurrentNumbers(
    workspaceId: string,
    slips: StatutoryReturnSlip[],
  ): Promise<StatutoryReturnSlip[]> {
    const lacking = slips
      .filter((slip) => slip.uan == null || slip.esiIpNumber == null)
      .map((slip) => slip.memberId);
    if (lacking.length === 0) return slips;
    const today = await this.store.today(workspaceId);
    const configs = await this.deps.configs.inForce(
      workspaceId,
      [...new Set(lacking)],
      today,
    );
    return slips.map((slip) => {
      const config = configs.get(slip.memberId)?.config;
      return {
        ...slip,
        uan: slip.uan ?? config?.uan ?? null,
        esiIpNumber: slip.esiIpNumber ?? config?.esiIpNumber ?? null,
      };
    });
  }

  /** The PF ECR of an approved month. */
  async pfReturn(
    access: MemberAccess,
    month: string,
  ): Promise<StatutoryReturnHeader & { ecr: EcrReturn }> {
    const { header, slips } = await this.approvedSlips(access, month);
    return { ...header, ecr: buildEcrReturn(slips) };
  }

  /** The ESIC monthly contribution rows of an approved month. */
  async esiReturn(
    access: MemberAccess,
    month: string,
  ): Promise<StatutoryReturnHeader & { esi: EsiReturn }> {
    const { header, slips } = await this.approvedSlips(access, month);
    return { ...header, esi: buildEsiReturn(slips) };
  }
}

function dateTimeIn(timezone: string, at: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat("en-IN", {
      ...options,
      timeZone: timezone,
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-IN", {
      ...options,
      timeZone: "Asia/Kolkata",
    }).format(at);
  }
}
