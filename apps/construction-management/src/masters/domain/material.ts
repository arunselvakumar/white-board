import { parseDecimal, pow10 } from "@/src/shared-kernel/decimal";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { percentHundredths } from "@/src/shared-kernel/gst-line";

import { masterNotFound } from "./master-kind";

/** Item Type (`modules/02`): what the Company does with the material. */
export const MATERIAL_ITEM_TYPES = [
  "consumable",
  "non_consumable",
  "asset",
] as const;
export type MaterialItemType = (typeof MATERIAL_ITEM_TYPES)[number];

export const MATERIAL_NAME_MAX = 120;
export const MATERIAL_SPECIFICATION_MAX = 500;
/** ₹1,000 crore in paise, the largest rate or discount a form takes. */
export const MATERIAL_AMOUNT_MAX = 1_000_000_000_000;

export type MaterialDiscount =
  | { type: "amount"; paise: number }
  | { type: "percent"; percent: string };

/**
 * Rate Details (Financial): the defaults procurement copies onto a line.
 * Each is optional; percents are decimal strings with two places.
 */
export type MaterialRate = {
  /** Paise per unit. */
  unitRate: number | null;
  discount: MaterialDiscount | null;
  gstRate: string | null;
  hsnCode: string | null;
};

export const NO_RATE: MaterialRate = {
  unitRate: null,
  discount: null,
  gstRate: null,
  hsnCode: null,
};

export type MaterialRateInput = {
  unitRate?: number | null;
  discount?:
    | { type: "amount"; paise: number }
    | { type: "percent"; percent: string }
    | null;
  gstRate?: string | null;
  hsnCode?: string | null;
};

export type MaterialDetailsInput = {
  name: string;
  specification?: string | null;
  uomId: string;
  categoryId?: string | null;
  itemType?: string | null;
  /** Decimal string, at most three places. */
  minStockQty?: string | null;
};

export type MaterialDetails = {
  name: string;
  specification: string | null;
  uomId: string;
  categoryId: string | null;
  itemType: MaterialItemType;
  minStockQty: string | null;
};

function blank(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  return value === "" ? null : value;
}

function amount(raw: number, code: string, words: string): number {
  if (!Number.isSafeInteger(raw) || raw < 0 || raw > MATERIAL_AMOUNT_MAX)
    throw new DomainError(code, `Enter ${words} in rupees, up to ₹1,000 crore.`);
  return raw;
}

/** A percent "0"–"100" with at most two places, as "18.00". */
export function percentText(raw: string, code: string): string {
  const hundredths = percentHundredths(raw, code);
  const whole = hundredths / 100n;
  const fraction = (hundredths % 100n).toString().padStart(2, "0");
  return `${whole.toString()}.${fraction}`;
}

/** A non-negative quantity with at most three places, as "50.000". */
export function minStockText(raw: string): string {
  let parsed: { numerator: bigint; scale: number };
  try {
    parsed = parseDecimal(raw);
  } catch {
    throw new DomainError(
      "MIN_STOCK_QTY_INVALID",
      "Enter the minimum stock as a number.",
    );
  }
  if (parsed.scale > 3)
    throw new DomainError(
      "MIN_STOCK_QTY_INVALID",
      "Minimum stock has at most three decimals.",
    );
  const milli = parsed.numerator * pow10(3 - parsed.scale);
  if (milli < 0n || milli >= 10n ** 14n)
    throw new DomainError(
      "MIN_STOCK_QTY_INVALID",
      "Minimum stock cannot be negative.",
    );
  const fraction = (milli % 1000n).toString().padStart(3, "0");
  return `${(milli / 1000n).toString()}.${fraction}`;
}

/** HSN: 4, 6 or 8 digits in practice; we take 4 to 8 digits. */
const HSN = /^\d{4,8}$/;

/** Checks the Rate Details section (CM-501). */
export function materialRate(input: MaterialRateInput): MaterialRate {
  const unitRate =
    input.unitRate == null
      ? null
      : amount(input.unitRate, "UNIT_RATE_INVALID", "the unit rate");
  let discount: MaterialDiscount | null = null;
  if (input.discount != null)
    discount =
      input.discount.type === "amount"
        ? {
            type: "amount",
            paise: amount(input.discount.paise, "DISCOUNT_INVALID", "the discount"),
          }
        : {
            type: "percent",
            percent: percentText(input.discount.percent, "DISCOUNT_INVALID"),
          };
  const gst = blank(input.gstRate);
  const gstRate = gst == null ? null : percentText(gst, "GST_RATE_INVALID");
  const hsnCode = blank(input.hsnCode)?.replace(/\s+/g, "") ?? null;
  if (hsnCode != null && !HSN.test(hsnCode))
    throw new DomainError(
      "HSN_CODE_INVALID",
      "Enter an HSN code of 4 to 8 digits.",
    );
  return { unitRate, discount, gstRate, hsnCode };
}

/** Checks the rest of the Material form (CM-501). */
export function materialDetails(input: MaterialDetailsInput): MaterialDetails {
  const name = blank(input.name)?.replace(/\s+/g, " ") ?? null;
  if (name == null)
    throw new DomainError("MATERIAL_NAME_REQUIRED", "Enter the Material name.");
  if (name.length > MATERIAL_NAME_MAX)
    throw new DomainError(
      "MATERIAL_NAME_TOO_LONG",
      `Material name must be at most ${String(MATERIAL_NAME_MAX)} characters.`,
    );
  const specification = blank(input.specification);
  if (
    specification != null &&
    specification.length > MATERIAL_SPECIFICATION_MAX
  )
    throw new DomainError(
      "SPECIFICATION_TOO_LONG",
      `Specification must be at most ${String(MATERIAL_SPECIFICATION_MAX)} characters.`,
    );
  if (blank(input.uomId) == null)
    throw new DomainError(
      "MEASUREMENT_UNIT_REQUIRED",
      "Choose the Measurement Unit.",
    );
  const itemType = input.itemType ?? "consumable";
  if (!(MATERIAL_ITEM_TYPES as readonly string[]).includes(itemType))
    throw new DomainError(
      "ITEM_TYPE_INVALID",
      "Choose Consumable, Non-consumable or Asset.",
    );
  const min = blank(input.minStockQty);
  return {
    name,
    specification,
    uomId: input.uomId.trim(),
    categoryId: blank(input.categoryId),
    itemType: itemType as MaterialItemType,
    minStockQty: min == null ? null : minStockText(min),
  };
}

export type MaterialProps = MaterialDetails &
  MaterialRate & {
    id: string;
    workspaceId: string;
    disabledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    updatedBy: string;
    deletedAt: Date | null;
    deletedBy: string | null;
  };

export type MaterialSnapshot = MaterialDetails &
  MaterialRate & { disabled: boolean };

/**
 * A material the Company buys and stocks (CM-501, `modules/02`): name,
 * specification, unit, category, Item Type, Rate Details and minimum
 * stock. Procurement copies what a line needs at save.
 */
export class Material {
  private constructor(private props: MaterialProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    details: MaterialDetailsInput;
    rate: MaterialRateInput;
    by: string;
    now: Date;
  }): Material {
    return new Material({
      id: input.id,
      workspaceId: input.workspaceId,
      ...materialDetails(input.details),
      ...materialRate(input.rate),
      disabledAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
      deletedBy: null,
    });
  }

  static reconstitute(props: MaterialProps): Material {
    return new Material(props);
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get name(): string {
    return this.props.name;
  }
  get details(): MaterialDetails {
    const { name, specification, uomId, categoryId, itemType, minStockQty } =
      this.props;
    return { name, specification, uomId, categoryId, itemType, minStockQty };
  }
  get rate(): MaterialRate {
    const { unitRate, discount, gstRate, hsnCode } = this.props;
    return { unitRate, discount, gstRate, hsnCode };
  }
  get uomId(): string {
    return this.props.uomId;
  }
  get categoryId(): string | null {
    return this.props.categoryId;
  }
  get disabled(): boolean {
    return this.props.disabledAt != null;
  }
  get disabledAt(): Date | null {
    return this.props.disabledAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get deletedBy(): string | null {
    return this.props.deletedBy;
  }

  snapshot(): MaterialSnapshot {
    return { ...this.details, ...this.rate, disabled: this.disabled };
  }

  private assertLive(): void {
    if (this.props.deletedAt != null) throw masterNotFound("material");
  }

  /**
   * The whole form. `rate` is "keep" when the editor has no Financial
   * flag: what they cannot see, they cannot change.
   */
  update(
    input: { details: MaterialDetailsInput; rate: MaterialRateInput | "keep" },
    by: string,
    now: Date,
  ): void {
    this.assertLive();
    this.props = {
      ...this.props,
      ...materialDetails(input.details),
      ...(input.rate === "keep" ? this.rate : materialRate(input.rate)),
      updatedAt: now,
      updatedBy: by,
    };
  }

  setDisabled(disabled: boolean, by: string, now: Date): boolean {
    this.assertLive();
    if (this.disabled === disabled) return false;
    this.props = {
      ...this.props,
      disabledAt: disabled ? now : null,
      updatedAt: now,
      updatedBy: by,
    };
    return true;
  }

  delete(by: string, now: Date): void {
    this.assertLive();
    this.props = {
      ...this.props,
      deletedAt: now,
      deletedBy: by,
      updatedAt: now,
      updatedBy: by,
    };
  }
}
