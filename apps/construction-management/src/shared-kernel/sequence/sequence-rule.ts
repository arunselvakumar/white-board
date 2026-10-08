import { DomainError } from "../domain-error";
import type { FiscalYear } from "./fiscal-year";
import { sequenceModule, type SequenceModuleKey } from "./modules";

/**
 * How one module's document numbers look (CM-114, `modules/12`).
 *
 * A number is its parts joined by `separator`, empty parts skipped, in this
 * order: prefix, fiscal year, project token, zero-padded counter —
 * `PR/26-27/P1/00001`. The preview on the Settings screen calls the same
 * `formatSequenceNumber`.
 *
 * Counters restart at `startNumber` each fiscal year when the fiscal-year
 * token is on. With the token off the counter never restarts, so numbers
 * cannot repeat from one year to the next.
 */
export type SequenceRuleSettings = {
  prefix: string;
  projectToken: string;
  /** ≥ 1. The first number of each fiscal year (or ever, without the token). */
  startNumber: number;
  /** Digits the counter is padded to; longer numbers are never cut. */
  padding: number;
  separator: SequenceSeparator;
  fiscalYearToken: boolean;
};

export type SequenceRule = SequenceRuleSettings & {
  id: string;
  workspaceId: string;
  module: SequenceModuleKey;
  /** Null: the module's default rule, "All projects". */
  projectId: string | null;
};

export const SEQUENCE_SEPARATORS = ["/", "-", "_", ".", ""] as const;
export type SequenceSeparator = (typeof SEQUENCE_SEPARATORS)[number];

export const SEQUENCE_LIMITS = {
  tokenLength: 20,
  maxStartNumber: 999_999_999,
  minPadding: 1,
  maxPadding: 10,
  defaultPadding: 5,
} as const;

const TOKEN_RE = /^[A-Za-z0-9/_.-]*$/;

/** The rule a module uses until the Company saves its own: `PR/26-27/00001`. */
export function standardSequenceSettings(
  module: SequenceModuleKey,
): SequenceRuleSettings {
  return {
    prefix: sequenceModule(module).defaultPrefix,
    projectToken: "",
    startNumber: 1,
    padding: SEQUENCE_LIMITS.defaultPadding,
    separator: "/",
    fiscalYearToken: true,
  };
}

function token(value: string, code: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length > SEQUENCE_LIMITS.tokenLength || !TOKEN_RE.test(trimmed))
    throw new DomainError(
      code,
      `${label} may use up to ${String(SEQUENCE_LIMITS.tokenLength)} letters, digits and / - _ .`,
    );
  return trimmed;
}

export type SequenceRuleSettingsInput = {
  prefix?: string;
  projectToken?: string;
  startNumber?: number;
  padding?: number;
  separator?: string;
  fiscalYearToken?: boolean;
};

/** Validates settings; missing values take the defaults (padding 5, "/", FY token on). */
export function createSequenceRuleSettings(
  input: SequenceRuleSettingsInput,
): SequenceRuleSettings {
  const startNumber = input.startNumber ?? 1;
  if (
    !Number.isInteger(startNumber) ||
    startNumber < 1 ||
    startNumber > SEQUENCE_LIMITS.maxStartNumber
  )
    throw new DomainError(
      "SEQUENCE_START_NUMBER_INVALID",
      "The start number must be a whole number of 1 or more.",
    );
  const padding = input.padding ?? SEQUENCE_LIMITS.defaultPadding;
  if (
    !Number.isInteger(padding) ||
    padding < SEQUENCE_LIMITS.minPadding ||
    padding > SEQUENCE_LIMITS.maxPadding
  )
    throw new DomainError(
      "SEQUENCE_PADDING_INVALID",
      `Digits must be from ${String(SEQUENCE_LIMITS.minPadding)} to ${String(SEQUENCE_LIMITS.maxPadding)}.`,
    );
  const separator = input.separator ?? "/";
  if (!(SEQUENCE_SEPARATORS as readonly string[]).includes(separator))
    throw new DomainError(
      "SEQUENCE_SEPARATOR_INVALID",
      "The separator must be one of / - _ . or none.",
    );
  return {
    prefix: token(input.prefix ?? "", "SEQUENCE_PREFIX_INVALID", "The prefix"),
    projectToken: token(
      input.projectToken ?? "",
      "SEQUENCE_PROJECT_TOKEN_INVALID",
      "The project token",
    ),
    startNumber,
    padding,
    separator: separator as SequenceSeparator,
    fiscalYearToken: input.fiscalYearToken ?? true,
  };
}

/** `PR/26-27/P1/00001`. */
export function formatSequenceNumber(
  rule: SequenceRuleSettings,
  fiscalYear: FiscalYear,
  number: number,
): string {
  return [
    rule.prefix,
    rule.fiscalYearToken ? fiscalYear.label : "",
    rule.projectToken,
    String(number).padStart(rule.padding, "0"),
  ]
    .filter((part) => part !== "")
    .join(rule.separator);
}

/**
 * The counter bucket a number is drawn from: the fiscal year's start year
 * with the token on, 0 (one bucket for ever) with it off.
 */
export function counterYear(
  rule: Pick<SequenceRuleSettings, "fiscalYearToken">,
  fiscalYear: FiscalYear,
): number {
  return rule.fiscalYearToken ? fiscalYear.startYear : 0;
}
