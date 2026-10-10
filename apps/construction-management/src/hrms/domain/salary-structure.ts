import {
  divideRounded,
  parseDecimal,
  pow10,
} from "@/src/shared-kernel/decimal";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * A salary structure (CM-314): the template a member's monthly salary is
 * worked out from. Components are each a fixed monthly amount or a
 * percentage of the member's base monthly salary, and one may be the
 * balancing component that takes base − the others (ADR CM-0012 §12).
 * Statutory switches keep the legacy per-template overrides; a null
 * override means "use the dated table" (ADR CM-0008). Money is integer
 * paise; percentages are decimal strings with up to two places, so no
 * float touches either.
 */

export const COMPONENT_BASES = ["fixed", "percent_of_base"] as const;
export type ComponentBasis = (typeof COMPONENT_BASES)[number];

export const SALARY_STRUCTURE_LIMITS = {
  maxNameLength: 100,
  maxDescriptionLength: 500,
  maxComponents: 20,
  maxDeductions: 20,
  /** ₹1 crore a month: every amount fits a 32-bit column (ADR CM-0004). */
  maxMonthlyPaise: 1_000_000_000,
} as const;

export type SalaryComponent = Readonly<{
  /** Stable across edits: member overrides are keyed by it. */
  id: string;
  name: string;
  basis: ComponentBasis;
  /** Paise a month; set exactly when `basis` is fixed and not balancing. */
  amount: number | null;
  /** "40" or "12.5"; set exactly when `basis` is percent and not balancing. */
  percent: string | null;
  isBalancing: boolean;
  /** Earned amount counts towards the PF wage. */
  countsForPfWage: boolean;
}>;

export type SalaryDeduction = Readonly<{
  name: string;
  /** Paise a month, never prorated. */
  amount: number;
}>;

export type SalaryStructure = Readonly<{
  name: string;
  description: string | null;
  components: readonly SalaryComponent[];
  pf: Readonly<{
    applicable: boolean;
    /** Employee share override, e.g. "10"; null = the table rate. */
    employeePercent: string | null;
    /** Cap the PF wage at the ceiling; off = PF on the whole PF wage. */
    capAtCeiling: boolean;
    /** Paise; null = the table ceiling. */
    wageCeiling: number | null;
  }>;
  esi: Readonly<{
    applicable: boolean;
    /** Employee share override; null = the table rate. */
    employeePercent: string | null;
  }>;
  pt: Readonly<{
    applicable: boolean;
    /** Flat paise a month; null = the state slab from HRMS Settings. */
    monthlyAmount: number | null;
  }>;
  deductAbsentDays: boolean;
  deductUnpaidLeave: boolean;
  otherDeductions: readonly SalaryDeduction[];
  isActive: boolean;
}>;

export type SalaryComponentInput = {
  /** Keep an existing component's id so member overrides stay attached. */
  id: string;
  name: string;
  basis: string;
  amount: number | null;
  percent: string | null;
  isBalancing: boolean;
  countsForPfWage: boolean;
};

export type SalaryStructureInput = {
  name: string;
  description: string | null;
  components: readonly SalaryComponentInput[];
  pf: {
    applicable: boolean;
    employeePercent: string | null;
    capAtCeiling: boolean;
    wageCeiling: number | null;
  };
  esi: { applicable: boolean; employeePercent: string | null };
  pt: { applicable: boolean; monthlyAmount: number | null };
  deductAbsentDays: boolean;
  deductUnpaidLeave: boolean;
  otherDeductions: readonly { name: string; amount: number }[];
  isActive: boolean;
};

function invalid(
  code: string,
  message: string,
  field: string,
  extra: Record<string, unknown> = {},
): DomainError {
  return new DomainError(code, message, { details: { field, ...extra } });
}

const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;

/** A percentage as hundredths of a percent ("12.5" → 1250), or null when malformed. */
export function percentHundredths(value: string): number | null {
  const text = value.trim();
  if (!PERCENT_RE.test(text)) return null;
  const { numerator, scale } = parseDecimal(text);
  return Number(divideRounded(numerator * 100n, pow10(scale)));
}

/** Hundredths of a percent back to the shortest decimal ("1250" → "12.5"). */
export function formatPercent(hundredths: number): string {
  const whole = Math.trunc(hundredths / 100);
  const fraction = hundredths % 100;
  if (fraction === 0) return String(whole);
  return `${String(whole)}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

/** `0 < p ≤ 100` with up to two places, normalised; else null. */
function validPercent(value: string, allowZero = false): string | null {
  const hundredths = percentHundredths(value);
  if (hundredths == null) return null;
  if (hundredths > 10_000 || (!allowZero && hundredths === 0)) return null;
  if (allowZero && hundredths < 0) return null;
  return formatPercent(hundredths);
}

function validAmount(value: number, allowZero = false): boolean {
  return (
    Number.isSafeInteger(value) &&
    (allowZero ? value >= 0 : value > 0) &&
    value <= SALARY_STRUCTURE_LIMITS.maxMonthlyPaise
  );
}

/**
 * Validates and normalises a structure (CM-314). Throws a `DomainError`
 * whose `details.field` names the field at fault (`components.2.percent`).
 *
 * The components must add up to the base for every base: either one is the
 * balancing component (the others' percentages then total at most 100%,
 * and fixed amounts are checked against each member's base), or every
 * component is a percentage and together they make exactly 100%.
 */
export function createSalaryStructure(
  input: SalaryStructureInput,
): SalaryStructure {
  const limits = SALARY_STRUCTURE_LIMITS;
  const name = input.name.trim();
  if (name.length === 0)
    throw invalid(
      "SALARY_STRUCTURE_NAME_REQUIRED",
      "Enter a name for the salary structure.",
      "name",
    );
  if (name.length > limits.maxNameLength)
    throw invalid(
      "SALARY_STRUCTURE_NAME_TOO_LONG",
      `Use at most ${String(limits.maxNameLength)} characters.`,
      "name",
    );
  const description = input.description?.trim() ?? "";
  if (description.length > limits.maxDescriptionLength)
    throw invalid(
      "SALARY_STRUCTURE_DESCRIPTION_TOO_LONG",
      `Use at most ${String(limits.maxDescriptionLength)} characters.`,
      "description",
    );

  if (input.components.length === 0)
    throw invalid(
      "SALARY_COMPONENTS_REQUIRED",
      "Add at least one component, like Basic.",
      "components",
    );
  if (input.components.length > limits.maxComponents)
    throw invalid(
      "SALARY_COMPONENTS_TOO_MANY",
      `A structure has at most ${String(limits.maxComponents)} components.`,
      "components",
    );

  const names = new Set<string>();
  const ids = new Set<string>();
  let balancing = 0;
  let percentTotal = 0;
  const components: SalaryComponent[] = input.components.map(
    (component, index) => {
      const field = (key: string) => `components.${String(index)}.${key}`;
      const componentName = component.name.trim();
      if (componentName.length === 0)
        throw invalid(
          "SALARY_COMPONENT_NAME_REQUIRED",
          "Enter the component's name.",
          field("name"),
        );
      if (componentName.length > limits.maxNameLength)
        throw invalid(
          "SALARY_COMPONENT_NAME_TOO_LONG",
          `Use at most ${String(limits.maxNameLength)} characters.`,
          field("name"),
        );
      const key = componentName.toLowerCase();
      if (names.has(key))
        throw invalid(
          "SALARY_COMPONENT_NAME_DUPLICATE",
          `There is already a component called ${componentName}.`,
          field("name"),
        );
      names.add(key);
      if (ids.has(component.id))
        throw invalid(
          "SALARY_COMPONENT_DUPLICATE",
          "A component appears twice.",
          field("name"),
        );
      ids.add(component.id);
      if (!(COMPONENT_BASES as readonly string[]).includes(component.basis))
        throw invalid(
          "SALARY_COMPONENT_BASIS_INVALID",
          "Choose a fixed amount or a percentage of the base salary.",
          field("basis"),
        );
      const basis = component.basis as ComponentBasis;
      if (component.isBalancing) {
        balancing += 1;
        if (balancing > 1)
          throw invalid(
            "BALANCING_COMPONENT_MULTIPLE",
            "Only one component can be the balancing component.",
            field("isBalancing"),
          );
        return Object.freeze({
          id: component.id,
          name: componentName,
          basis,
          amount: null,
          percent: null,
          isBalancing: true,
          countsForPfWage: component.countsForPfWage,
        });
      }
      if (basis === "fixed") {
        if (component.amount == null || !validAmount(component.amount))
          throw invalid(
            "SALARY_COMPONENT_AMOUNT_INVALID",
            "Enter an amount above ₹0 and at most ₹1,00,00,000 a month.",
            field("amount"),
          );
        return Object.freeze({
          id: component.id,
          name: componentName,
          basis,
          amount: component.amount,
          percent: null,
          isBalancing: false,
          countsForPfWage: component.countsForPfWage,
        });
      }
      const percent =
        component.percent == null ? null : validPercent(component.percent);
      if (percent == null)
        throw invalid(
          "SALARY_COMPONENT_PERCENT_INVALID",
          "Enter a percentage above 0 and at most 100, with up to two decimals.",
          field("percent"),
        );
      percentTotal += percentHundredths(percent) ?? 0;
      return Object.freeze({
        id: component.id,
        name: componentName,
        basis,
        amount: null,
        percent,
        isBalancing: false,
        countsForPfWage: component.countsForPfWage,
      });
    },
  );

  if (balancing === 1) {
    if (percentTotal > 10_000)
      throw invalid(
        "BALANCING_COMPONENT_NEGATIVE",
        `The percentages add up to ${formatPercent(percentTotal)}%, so nothing is left for the balancing component. Keep them at 100% or less.`,
        "components",
      );
  } else {
    const allPercent = components.every(
      (component) => component.basis === "percent_of_base",
    );
    if (!allPercent || percentTotal !== 10_000)
      throw invalid(
        "SALARY_COMPONENTS_NOT_100_PERCENT",
        allPercent
          ? `The percentages add up to ${formatPercent(percentTotal)}%. Make them 100%, or mark one component as balancing.`
          : "With a fixed amount, mark one component as balancing so the components always add up to the base salary.",
        "components",
      );
  }

  let pfEmployeePercent: string | null = null;
  let pfWageCeiling: number | null = null;
  if (input.pf.applicable) {
    if (input.pf.employeePercent != null) {
      pfEmployeePercent = validPercent(input.pf.employeePercent);
      if (pfEmployeePercent == null)
        throw invalid(
          "PF_PERCENT_INVALID",
          "Enter the employee PF % above 0 and at most 100, or leave it empty for the statutory rate.",
          "pf.employeePercent",
        );
    }
    if (input.pf.capAtCeiling && input.pf.wageCeiling != null) {
      if (!validAmount(input.pf.wageCeiling))
        throw invalid(
          "PF_WAGE_CEILING_INVALID",
          "Enter a PF wage ceiling above ₹0, or leave it empty for the statutory ceiling.",
          "pf.wageCeiling",
        );
      pfWageCeiling = input.pf.wageCeiling;
    }
    if (!components.some((component) => component.countsForPfWage))
      throw invalid(
        "PF_WAGE_COMPONENTS_REQUIRED",
        "Mark the components PF is worked out on, like Basic.",
        "components",
      );
  }

  let esiEmployeePercent: string | null = null;
  if (input.esi.applicable && input.esi.employeePercent != null) {
    esiEmployeePercent = validPercent(input.esi.employeePercent);
    if (esiEmployeePercent == null)
      throw invalid(
        "ESI_PERCENT_INVALID",
        "Enter the employee ESI % above 0 and at most 100, or leave it empty for the statutory rate.",
        "esi.employeePercent",
      );
  }

  let ptMonthlyAmount: number | null = null;
  if (input.pt.applicable && input.pt.monthlyAmount != null) {
    if (!validAmount(input.pt.monthlyAmount, true))
      throw invalid(
        "PT_AMOUNT_INVALID",
        "Enter a professional tax amount of ₹0 or more, or leave it empty for the state's slabs.",
        "pt.monthlyAmount",
      );
    ptMonthlyAmount = input.pt.monthlyAmount;
  }

  if (input.otherDeductions.length > limits.maxDeductions)
    throw invalid(
      "SALARY_DEDUCTIONS_TOO_MANY",
      `A structure has at most ${String(limits.maxDeductions)} other deductions.`,
      "otherDeductions",
    );
  const deductionNames = new Set<string>();
  const otherDeductions = input.otherDeductions.map((deduction, index) => {
    const field = (key: string) => `otherDeductions.${String(index)}.${key}`;
    const deductionName = deduction.name.trim();
    if (deductionName.length === 0)
      throw invalid(
        "SALARY_DEDUCTION_NAME_REQUIRED",
        "Enter the deduction's name.",
        field("name"),
      );
    if (deductionName.length > limits.maxNameLength)
      throw invalid(
        "SALARY_DEDUCTION_NAME_TOO_LONG",
        `Use at most ${String(limits.maxNameLength)} characters.`,
        field("name"),
      );
    if (deductionNames.has(deductionName.toLowerCase()))
      throw invalid(
        "SALARY_DEDUCTION_NAME_DUPLICATE",
        `There is already a deduction called ${deductionName}.`,
        field("name"),
      );
    deductionNames.add(deductionName.toLowerCase());
    if (!validAmount(deduction.amount))
      throw invalid(
        "SALARY_DEDUCTION_AMOUNT_INVALID",
        "Enter an amount above ₹0.",
        field("amount"),
      );
    return Object.freeze({ name: deductionName, amount: deduction.amount });
  });

  return Object.freeze({
    name,
    description: description.length === 0 ? null : description,
    components: Object.freeze(components),
    pf: Object.freeze({
      applicable: input.pf.applicable,
      employeePercent: pfEmployeePercent,
      capAtCeiling: input.pf.applicable ? input.pf.capAtCeiling : true,
      wageCeiling: pfWageCeiling,
    }),
    esi: Object.freeze({
      applicable: input.esi.applicable,
      employeePercent: esiEmployeePercent,
    }),
    pt: Object.freeze({
      applicable: input.pt.applicable,
      monthlyAmount: ptMonthlyAmount,
    }),
    deductAbsentDays: input.deductAbsentDays,
    deductUnpaidLeave: input.deductUnpaidLeave,
    otherDeductions: Object.freeze(otherDeductions),
    isActive: input.isActive,
  });
}

// ---------------------------------------------------------------------------
// A member's components for their base (CM-315, CM-316)
// ---------------------------------------------------------------------------

/**
 * A member's own amount for one component (CM-315), keyed by component id:
 * a fixed amount in paise or a percentage of their base. The balancing
 * component cannot be overridden: it is what is left.
 */
export type ComponentOverride =
  | { amount: number; percent?: undefined }
  | { percent: string; amount?: undefined };

export type ComponentOverrides = Readonly<Record<string, ComponentOverride>>;

export type ComponentAmount = Readonly<{
  componentId: string;
  name: string;
  /** Paise a month for a full month. */
  monthly: number;
  countsForPfWage: boolean;
  isBalancing: boolean;
}>;

/** `amount × percent / 100`, rounded half up to the paisa. */
export function percentOf(amount: number, percent: string): number {
  const { numerator, scale } = parseDecimal(percent);
  return Number(divideRounded(BigInt(amount) * numerator, 100n * pow10(scale)));
}

/**
 * Checks a member's overrides against the structure: each names a live,
 * non-balancing component, with an amount (paise, 0 or more) or a
 * percentage (0–100, two places). Overrides of components no longer on the
 * structure are dropped, so editing a structure never breaks a member.
 */
export function cleanOverrides(
  structure: SalaryStructure,
  overrides: Readonly<Record<string, unknown>>,
): ComponentOverrides {
  const byId = new Map(
    structure.components.map((component) => [component.id, component]),
  );
  const clean: Record<string, ComponentOverride> = {};
  for (const [id, raw] of Object.entries(overrides)) {
    const component = byId.get(id);
    if (component == null) continue;
    const field = `componentOverrides.${id}`;
    if (component.isBalancing)
      throw invalid(
        "COMPONENT_OVERRIDE_BALANCING",
        `${component.name} is the balancing component: it takes what is left of the base salary.`,
        field,
      );
    const value = (raw ?? {}) as { amount?: unknown; percent?: unknown };
    if (typeof value.amount === "number" && value.percent === undefined) {
      if (!validAmount(value.amount, true))
        throw invalid(
          "COMPONENT_OVERRIDE_INVALID",
          `Enter ${component.name} as ₹0 or more.`,
          field,
        );
      clean[id] = { amount: value.amount };
      continue;
    }
    if (typeof value.percent === "string" && value.amount === undefined) {
      const percent = validPercent(value.percent, true);
      if (percent == null)
        throw invalid(
          "COMPONENT_OVERRIDE_INVALID",
          `Enter ${component.name} as a percentage from 0 to 100.`,
          field,
        );
      clean[id] = { percent };
      continue;
    }
    throw invalid(
      "COMPONENT_OVERRIDE_INVALID",
      `Give ${component.name} either an amount or a percentage.`,
      field,
    );
  }
  return Object.freeze(clean);
}

/**
 * Each component's monthly amount for a base salary (ADR CM-0012 §12).
 * Percentages are rounded half up to the paisa; the balancing component
 * takes base − the others and must not go negative
 * (`BALANCING_COMPONENT_NEGATIVE`, `details.field` "baseMonthly"). Without
 * a balancing component the percentages make 100%, and the last component
 * takes the paise lost to rounding so the lines always add up to the base;
 * a member override that breaks the total is `SALARY_COMPONENTS_NOT_100_PERCENT`.
 */
export function componentAmounts(
  structure: SalaryStructure,
  baseMonthly: number,
  overrides: ComponentOverrides = {},
): ComponentAmount[] {
  if (!validAmount(baseMonthly, true))
    throw invalid(
      "BASE_MONTHLY_INVALID",
      "Enter a base salary of ₹0 or more, at most ₹1,00,00,000 a month.",
      "baseMonthly",
    );
  const lines = structure.components.map((component) => {
    const override = overrides[component.id];
    let monthly = 0;
    if (!component.isBalancing) {
      if (override?.amount != null) monthly = override.amount;
      else if (override?.percent != null)
        monthly = percentOf(baseMonthly, override.percent);
      else if (component.basis === "fixed") monthly = component.amount ?? 0;
      else monthly = percentOf(baseMonthly, component.percent ?? "0");
    }
    return {
      componentId: component.id,
      name: component.name,
      monthly,
      countsForPfWage: component.countsForPfWage,
      isBalancing: component.isBalancing,
    };
  });
  const others = lines.reduce((sum, line) => sum + line.monthly, 0);
  const balancing = lines.find((line) => line.isBalancing);
  if (balancing != null) {
    const left = baseMonthly - others;
    if (left < 0)
      throw invalid(
        "BALANCING_COMPONENT_NEGATIVE",
        `The other components come to more than the base salary, so ${balancing.name} would be negative. Raise the base salary or lower the other components.`,
        "baseMonthly",
        { balancing: balancing.name, shortBy: -left },
      );
    balancing.monthly = left;
  } else {
    const difference = baseMonthly - others;
    const last = lines[lines.length - 1];
    // Rounding loses at most half a paisa per percentage line.
    if (
      last == null ||
      Math.abs(difference) > lines.length ||
      last.monthly + difference < 0
    )
      throw invalid(
        "SALARY_COMPONENTS_NOT_100_PERCENT",
        "These amounts do not add up to the base salary. Change the overrides, or use a structure with a balancing component.",
        "componentOverrides",
      );
    last.monthly += difference;
  }
  return lines.map((line) => Object.freeze(line));
}
