import type { TdsPayeeKind } from "../domain/tds";
import financeSeeds from "./seeds/finance.json";
import tdsSeeds from "./seeds/statutory/tds-rates.json";

export type SeedAccount = {
  name: string;
  kind: "cash" | "bank";
  isPrimary: boolean;
};

export type TdsRateSeed = {
  section: string;
  label: string;
  payeeKind: TdsPayeeKind;
  /** Percent, two places. */
  rate: string;
  /** Paise. */
  singleThreshold: number;
  /** Paise. */
  aggregateThreshold: number;
  effectiveFrom: string;
  source: string;
};

/**
 * What every Company starts with (ADR CM-0017 §2): the two company accounts
 * and the Payment Categories. `seedCompanyFinance` copies them on
 * `CompanyCreated`; migration `…_construction_finance_seeds` backfilled the
 * Companies created before M7 (`finance-seeds.test.ts` keeps both in step).
 */
export const ACCOUNT_SEEDS: readonly SeedAccount[] = financeSeeds.accounts.map(
  (row) => ({
    ...row,
    kind: row.kind as SeedAccount["kind"],
  }),
);
export const PAYMENT_CATEGORY_SEEDS: readonly string[] =
  financeSeeds.paymentCategories;

/**
 * The TDS rate rows (ADR CM-0008, CM-0017 §8), versioned JSON. A migration
 * inserts them with `tdsRateSql`; a new notification is a new JSON row plus
 * a new migration holding the line `tdsRateSql` prints for it.
 */
export const TDS_RATE_SEEDS: readonly TdsRateSeed[] = tdsSeeds.rows.map(
  (row) => ({ ...row, payeeKind: row.payeeKind as TdsPayeeKind }),
);

function text(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function int(value: number): string {
  if (!Number.isSafeInteger(value))
    throw new RangeError(`Not an integer: ${String(value)}`);
  return String(value);
}

function decimal(value: string): string {
  if (!/^\d+(\.\d+)?$/.test(value))
    throw new RangeError(`Not a decimal: ${value}`);
  return value;
}

export function tdsRateSql(row: TdsRateSeed): string {
  const columns: Record<string, string> = {
    section: text(row.section),
    label: text(row.label),
    payee_kind: text(row.payeeKind),
    rate: decimal(row.rate),
    single_threshold: int(row.singleThreshold),
    aggregate_threshold: int(row.aggregateThreshold),
    effective_from: text(row.effectiveFrom),
    source: text(row.source),
  };
  const names = Object.keys(columns)
    .map((name) => `"${name}"`)
    .join(", ");
  const values = Object.values(columns).join(", ");
  return `INSERT INTO "construction_finance"."statutory_tds_rates" ("id", ${names}) VALUES (gen_random_uuid(), ${values}) ON CONFLICT DO NOTHING;`;
}
