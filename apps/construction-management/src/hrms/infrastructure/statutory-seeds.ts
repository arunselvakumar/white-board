import type { EsiRate, PfRate, PtSlab } from "../domain/statutory";
import esiSeeds from "./seeds/statutory/esi-rates.json";
import pfSeeds from "./seeds/statutory/pf-rates.json";
import ptSeeds from "./seeds/statutory/pt-slabs.json";

/**
 * The statutory seed rows (ADR CM-0008), versioned JSON. A migration
 * inserts them with `statutorySeedSql`; `statutory-seeds.test.ts` checks
 * that every JSON row has its INSERT in a migration and that no migration
 * inserts a row the JSON lacks. A new notification is a new JSON row plus a
 * new migration with the line `statutorySeedSql` prints for it.
 */
export const PF_RATE_SEEDS: readonly PfRate[] = pfSeeds.rows;
export const ESI_RATE_SEEDS: readonly EsiRate[] = esiSeeds.rows;
export const PT_SLAB_SEEDS: readonly PtSlab[] = ptSeeds.rows.map((row) => ({
  ...row,
  appliesTo: row.appliesTo as PtSlab["appliesTo"],
}));

const SCHEMA = '"construction_hrms"';

function text(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function int(value: number | null): string {
  if (value == null) return "NULL";
  if (!Number.isSafeInteger(value))
    throw new RangeError(`Not an integer: ${String(value)}`);
  return String(value);
}

function decimal(value: string): string {
  if (!/^\d+(\.\d+)?$/.test(value))
    throw new RangeError(`Not a decimal: ${value}`);
  return value;
}

function insert(table: string, columns: Record<string, string>): string {
  const names = Object.keys(columns)
    .map((name) => `"${name}"`)
    .join(", ");
  const values = Object.values(columns).join(", ");
  return `INSERT INTO ${SCHEMA}."${table}" ("id", ${names}) VALUES (gen_random_uuid(), ${values}) ON CONFLICT DO NOTHING;`;
}

export function pfRateSql(row: PfRate): string {
  return insert("statutory_pf_rates", {
    effective_from: text(row.effectiveFrom),
    wage_ceiling: int(row.wageCeiling),
    employee_percent: decimal(row.employeePercent),
    employer_percent: decimal(row.employerPercent),
    eps_percent: decimal(row.epsPercent),
    source: text(row.source),
  });
}

export function esiRateSql(row: EsiRate): string {
  return insert("statutory_esi_rates", {
    effective_from: text(row.effectiveFrom),
    wage_ceiling: int(row.wageCeiling),
    pwd_wage_ceiling: int(row.pwdWageCeiling),
    employee_percent: decimal(row.employeePercent),
    employer_percent: decimal(row.employerPercent),
    source: text(row.source),
  });
}

export function ptSlabSql(row: PtSlab): string {
  return insert("statutory_pt_slabs", {
    state_code: text(row.stateCode),
    effective_from: text(row.effectiveFrom),
    applies_to: text(row.appliesTo),
    gross_from: int(row.grossFrom),
    gross_to: int(row.grossTo),
    monthly_amount: int(row.monthlyAmount),
    special_month: int(row.specialMonth),
    special_month_amount: int(row.specialMonthAmount),
    source: text(row.source),
  });
}

/** One INSERT line per seed row, idempotent (`ON CONFLICT DO NOTHING`). */
export function statutorySeedSql(): string[] {
  return [
    ...PF_RATE_SEEDS.map(pfRateSql),
    ...ESI_RATE_SEEDS.map(esiRateSql),
    ...PT_SLAB_SEEDS.map(ptSlabSql),
  ];
}
