import type { Prisma } from "@repo/db";

import type { CalendarDate } from "../calendar-date";
import { newId } from "../ids";
import { fiscalYearOf, type FiscalYear } from "./fiscal-year";
import type { SequenceModuleKey } from "./modules";
import {
  counterYear,
  formatSequenceNumber,
  standardSequenceSettings,
  type SequenceRuleSettings,
  type SequenceSeparator,
} from "./sequence-rule";

type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

type RuleRow = {
  id: string;
  prefix: string;
  project_token: string;
  start_number: number;
  padding: number;
  separator: string;
  fiscal_year_token: boolean;
};

export type AllocatedSequenceNumber = {
  /** `PR/26-27/P1/00001`. */
  number: string;
  /** The counter value behind it. */
  sequence: number;
  ruleId: string;
  fiscalYear: FiscalYear;
};

/**
 * The project's rule if it has one, else the module's default. Locks the
 * rule row `FOR SHARE`, so a rule cannot be deleted while a number from it
 * is being issued.
 */
async function findRule(
  tx: Tx,
  workspaceId: string,
  module: SequenceModuleKey,
  projectId: string | null,
): Promise<RuleRow | null> {
  const rows = await tx.$queryRaw<RuleRow[]>`
    SELECT id, prefix, project_token, start_number, padding, separator, fiscal_year_token
    FROM construction_organization.sequence_rules
    WHERE workspace_id = ${workspaceId}
      AND module = ${module}
      AND deleted_at IS NULL
      AND (project_id IS NULL OR project_id = ${projectId})
    ORDER BY (project_id IS NULL) ASC
    LIMIT 1
    FOR SHARE
  `;
  return rows[0] ?? null;
}

/** Saves the module's standard rule as its default, unless one exists. */
async function insertStandardRule(
  tx: Tx,
  workspaceId: string,
  module: SequenceModuleKey,
  by: string,
): Promise<void> {
  const standard = standardSequenceSettings(module);
  await tx.$executeRaw`
    INSERT INTO construction_organization.sequence_rules
      (id, workspace_id, module, project_id, prefix, project_token, start_number,
       padding, separator, fiscal_year_token, created_by, updated_by)
    VALUES
      (${newId()}::uuid, ${workspaceId}, ${module}, NULL, ${standard.prefix},
       ${standard.projectToken}, ${standard.startNumber}, ${standard.padding},
       ${standard.separator}, ${standard.fiscalYearToken}, ${by}, ${by})
    ON CONFLICT (workspace_id, module) WHERE project_id IS NULL AND deleted_at IS NULL
    DO NOTHING
  `;
}

/**
 * Issues the next Sequence ID for a document (CM-114). Call it inside the
 * transaction that inserts the document: the counter row stays locked until
 * that transaction ends, so concurrent callers get consecutive numbers and
 * a rolled-back insert gives its number back (no gaps).
 *
 * `date` is the document's date in the Company time zone; it picks the
 * fiscal year. A module with no saved rule gets its standard rule saved as
 * the default on first use (`PR/26-27/00001`).
 */
export async function nextSequenceNumber(
  tx: Tx,
  input: {
    workspaceId: string;
    module: SequenceModuleKey;
    projectId: string | null;
    date: CalendarDate;
    /** The User issuing the document; recorded if the standard rule is saved. */
    by: string;
  },
): Promise<AllocatedSequenceNumber> {
  const fiscalYear = fiscalYearOf(input.date);
  let rule = await findRule(
    tx,
    input.workspaceId,
    input.module,
    input.projectId,
  );
  if (rule == null) {
    await insertStandardRule(tx, input.workspaceId, input.module, input.by);
    rule = await findRule(tx, input.workspaceId, input.module, input.projectId);
  }
  if (rule == null)
    throw new Error(`No sequence rule for ${input.module} after saving one.`);

  const settings: SequenceRuleSettings = {
    prefix: rule.prefix,
    projectToken: rule.project_token,
    startNumber: rule.start_number,
    padding: rule.padding,
    separator: rule.separator as SequenceSeparator,
    fiscalYearToken: rule.fiscal_year_token,
  };
  // Upsert-and-increment holds the counter row's lock until the caller
  // commits. GREATEST lets a raised start number jump ahead; a lowered one
  // never reissues a number.
  const counters = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO construction_organization.sequence_counters
      (rule_id, fiscal_year, last_number, updated_at)
    VALUES (${rule.id}::uuid, ${counterYear(settings, fiscalYear)}, ${settings.startNumber}, now())
    ON CONFLICT (rule_id, fiscal_year) DO UPDATE
      SET last_number = GREATEST(
            construction_organization.sequence_counters.last_number + 1,
            ${settings.startNumber}
          ),
          updated_at = now()
    RETURNING last_number
  `;
  const sequence = counters[0]?.last_number;
  if (sequence == null) throw new Error("The sequence counter was not issued.");
  return {
    number: formatSequenceNumber(settings, fiscalYear, sequence),
    sequence,
    ruleId: rule.id,
    fiscalYear,
  };
}
