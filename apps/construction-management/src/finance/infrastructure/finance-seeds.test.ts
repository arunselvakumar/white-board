import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCOUNT_SEEDS,
  PAYMENT_CATEGORY_SEEDS,
  TDS_RATE_SEEDS,
  tdsRateSql,
} from "./finance-seeds";

const MIGRATIONS = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/migrations",
);

function migrationsSql(): string {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      readFileSync(join(MIGRATIONS, entry.name, "migration.sql"), "utf8"),
    )
    .join("\n");
}

const sqlText = (value: string) => `'${value.replaceAll("'", "''")}'`;

describe("finance seeds (ADR CM-0008, CM-0017)", () => {
  const sql = migrationsSql();

  it("inserts exactly the JSON's TDS rate rows", () => {
    for (const row of TDS_RATE_SEEDS) expect(sql).toContain(tdsRateSql(row));
    const inserts = sql
      .split("\n")
      .filter((line) =>
        line.startsWith(
          'INSERT INTO "construction_finance"."statutory_tds_rates"',
        ),
      );
    expect(inserts).toHaveLength(TDS_RATE_SEEDS.length);
  });

  it("backfills the same accounts and Payment Categories new Companies get", () => {
    const seeds = readFileSync(
      join(
        MIGRATIONS,
        "20261013090500_construction_finance_seeds",
        "migration.sql",
      ),
      "utf8",
    );
    for (const account of ACCOUNT_SEEDS)
      expect(seeds).toContain(
        `(${sqlText(account.name)}, '${account.kind}', ${String(account.isPrimary)})`,
      );
    for (const name of PAYMENT_CATEGORY_SEEDS)
      expect(seeds).toContain(`(${sqlText(name)})`);
    expect(seeds.match(/^ {2}\('[^']*(?:''[^']*)*'\),?$/gm)).toHaveLength(
      PAYMENT_CATEGORY_SEEDS.length,
    );
  });

  it("starts with exactly one primary account", () => {
    expect(ACCOUNT_SEEDS.filter((account) => account.isPrimary)).toHaveLength(
      1,
    );
  });
});
