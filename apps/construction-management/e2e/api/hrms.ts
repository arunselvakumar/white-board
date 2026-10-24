import type { ApiClient } from "./ApiClient";

const HRMS = "/api/construction/hrms";

export async function leaveTypeId(
  api: ApiClient,
  name: string,
): Promise<string> {
  const { items } = await api.get<{ items: { id: string; name: string }[] }>(
    `${HRMS}/leave-types`,
  );
  const found = items.find((item) => item.name === name);
  if (found == null) throw new Error(`No leave type ${name}`);
  return found.id;
}

/**
 * Opens a member's leave balances for the current leave year and credits
 * `days` of `leaveType`, so they can apply for leave at once.
 */
export async function creditLeave(
  api: ApiClient,
  input: { memberId: string; leaveType: string; days: number },
): Promise<void> {
  await api.post(`${HRMS}/leave-balances/initialize`, {
    memberIds: [input.memberId],
  });
  await api.post(`${HRMS}/leave-balances/adjust`, {
    memberId: input.memberId,
    leaveTypeId: await leaveTypeId(api, input.leaveType),
    days: input.days,
    reason: "Opening credit for the end-to-end test",
  });
}

/** Changes some HRMS Settings, keeping the rest as they are. */
export async function updateHrmsSettings(
  api: ApiClient,
  changes: {
    gpsRequirement?: "disabled" | "record_only" | "required";
    /** ISO weekdays, 1 = Monday … 7 = Sunday. */
    workingDays?: number[];
  },
): Promise<void> {
  const settings = await api.get<
    Record<string, unknown> & { updatedAt: string | null }
  >(`${HRMS}/settings`);
  const { updatedAt, ...fields } = settings;
  await api.post(`${HRMS}/settings/update`, {
    ...fields,
    ...changes,
    expectedUpdatedAt: updatedAt,
  });
}

/** Sets how check-in treats the location (ADR CM-0012 §1). */
export async function setGpsRequirement(
  api: ApiClient,
  gpsRequirement: "disabled" | "record_only" | "required",
): Promise<void> {
  await updateHrmsSettings(api, { gpsRequirement });
}

/** Every day a working day, so today never counts as a week off. */
export const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

/** An office branch fenced `radiusMetres` around a point, with these members. */
export async function createOfficeBranch(
  api: ApiClient,
  input: {
    name: string;
    latitude: number;
    longitude: number;
    radiusMetres: number;
    memberIds: string[];
  },
): Promise<{ id: string }> {
  const created = await api.post<{ id: string; updatedAt: string }>(
    `${HRMS}/branches`,
    {
      kind: "office_branch",
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      radiusMetres: input.radiusMetres,
    },
  );
  await api.post(`${HRMS}/branches/${created.id}/members`, {
    memberIds: input.memberIds,
    expectedUpdatedAt: created.updatedAt,
  });
  return { id: created.id };
}

/** Basic 50% (PF wage) and Special the balance; PF on, no ESI or PT, no absent-day cut. */
export async function createSalaryStructure(
  api: ApiClient,
  name = "Office staff",
): Promise<{ id: string }> {
  return api.post(`${HRMS}/salary-structures`, {
    name,
    description: null,
    components: [
      {
        id: null,
        name: "Basic",
        basis: "percent_of_base",
        amount: null,
        percent: "50",
        isBalancing: false,
        countsForPfWage: true,
      },
      {
        id: null,
        name: "Special",
        basis: "fixed",
        amount: null,
        percent: null,
        isBalancing: true,
        countsForPfWage: false,
      },
    ],
    pf: {
      applicable: true,
      employeePercent: null,
      capAtCeiling: true,
      wageCeiling: null,
    },
    esi: { applicable: false, employeePercent: null },
    pt: { applicable: false, monthlyAmount: null },
    deductAbsentDays: false,
    deductUnpaidLeave: true,
    otherDeductions: [],
    isActive: true,
  });
}

/** Gives members `structureId` and a monthly base salary from 1 January. */
export async function configureSalary(
  api: ApiClient,
  input: { structureId: string; memberIds: string[]; baseRupees: number },
): Promise<void> {
  await api.post(`${HRMS}/employees/salary/save`, {
    rows: input.memberIds.map((memberId) => ({
      memberId,
      structureId: input.structureId,
      baseMonthly: input.baseRupees * 100,
      componentOverrides: null,
      gender: null,
      uan: null,
      esiIpNumber: null,
      effectiveFrom: `${new Date().getFullYear()}-01-01`,
      expectedUpdatedAt: null,
    })),
  });
}
