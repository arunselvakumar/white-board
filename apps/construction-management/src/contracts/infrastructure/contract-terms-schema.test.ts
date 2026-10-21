import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ADVANCE_DIRECTIONS,
  ADVANCE_KINDS,
  ANALYSIS_KINDS,
  BILL_STATUSES,
  BILL_TYPES,
  DEDUCTION_KINDS,
  ESCALATION_COMPONENTS,
  GUARANTEE_PURPOSES,
  ISSUE_BASES,
  MEASUREMENT_STATUSES,
  RECOVERY_MODES,
  RETENTION_STAGES,
  SIDES,
  VARIATION_KINDS,
  VARIATION_STATUSES,
  WORK_ORDER_LINE_KINDS,
  WORK_ORDER_STATUSES,
} from "../domain/contract-terms";

const SCHEMA = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/schema/construction-contracts.prisma",
);

/** Every enum's values as the schema lists them (comments and attributes skipped). */
function enumsIn(prisma: string): Record<string, string[]> {
  const enums: Record<string, string[]> = {};
  for (const match of prisma.matchAll(/^enum (\w+) \{([^}]*)\}/gm)) {
    const [, name = "", body = ""] = match;
    enums[name] = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[a-z_]+$/.test(line));
  }
  return enums;
}

describe("contracts words match the construction_contracts enums (CM-1101)", () => {
  const enums = enumsIn(readFileSync(SCHEMA, "utf8"));

  it.each([
    ["ConstructionContractsAnalysisKind", ANALYSIS_KINDS],
    ["ConstructionContractsSide", SIDES],
    ["ConstructionContractsVariationKind", VARIATION_KINDS],
    ["ConstructionContractsVariationStatus", VARIATION_STATUSES],
    ["ConstructionContractsWorkOrderStatus", WORK_ORDER_STATUSES],
    ["ConstructionContractsWorkOrderLineKind", WORK_ORDER_LINE_KINDS],
    ["ConstructionContractsIssueBasis", ISSUE_BASES],
    ["ConstructionContractsMeasurementStatus", MEASUREMENT_STATUSES],
    ["ConstructionContractsBillType", BILL_TYPES],
    ["ConstructionContractsBillStatus", BILL_STATUSES],
    ["ConstructionContractsDeductionKind", DEDUCTION_KINDS],
    ["ConstructionContractsAdvanceDirection", ADVANCE_DIRECTIONS],
    ["ConstructionContractsAdvanceKind", ADVANCE_KINDS],
    ["ConstructionContractsRecoveryMode", RECOVERY_MODES],
    ["ConstructionContractsGuaranteePurpose", GUARANTEE_PURPOSES],
    ["ConstructionContractsRetentionStage", RETENTION_STAGES],
    ["ConstructionContractsEscalationComponent", ESCALATION_COMPONENTS],
  ])("%s", (name, values) => {
    expect(enums[name]).toEqual([...values]);
  });

  it("covers every enum in the schema", () => {
    expect(Object.keys(enums)).toHaveLength(17);
  });
});
