import { parseDecimal, pow10 } from "./decimal";

/** Quantities keep three decimals: `decimal(14,3)` in Postgres. */
export const QUANTITY_SCALE = 3;

/**
 * An amount of something in a Unit of Measure (`03-target-architecture.md
 * §3`). Conversions between units are explicit; adding two quantities in
 * different units is an error, never a silent sqft↔sqm.
 */
export class Quantity {
  private constructor(
    /** Thousandths of the unit. */
    private readonly milli: bigint,
    readonly uomId: string,
  ) {}

  static of(value: string | number, uomId: string): Quantity {
    if (uomId.trim().length === 0)
      throw new RangeError("A Quantity needs a unit.");
    const { numerator, scale } = parseDecimal(value);
    if (scale > QUANTITY_SCALE)
      throw new RangeError(
        `A Quantity has at most ${String(QUANTITY_SCALE)} decimals.`,
      );
    return new Quantity(numerator * pow10(QUANTITY_SCALE - scale), uomId);
  }

  static zero(uomId: string): Quantity {
    return Quantity.of("0", uomId);
  }

  add(other: Quantity): Quantity {
    this.assertSameUnit(other);
    return new Quantity(this.milli + other.milli, this.uomId);
  }

  subtract(other: Quantity): Quantity {
    this.assertSameUnit(other);
    return new Quantity(this.milli - other.milli, this.uomId);
  }

  isNegative(): boolean {
    return this.milli < 0n;
  }

  equals(other: Quantity): boolean {
    return this.uomId === other.uomId && this.milli === other.milli;
  }

  /** The decimal string Prisma's `Decimal` and the HTTP models carry: `12.500`. */
  toDecimalString(): string {
    const negative = this.milli < 0n;
    const digits = (negative ? -this.milli : this.milli)
      .toString()
      .padStart(QUANTITY_SCALE + 1, "0");
    const whole = digits.slice(0, -QUANTITY_SCALE);
    const fraction = digits.slice(-QUANTITY_SCALE);
    return `${negative ? "-" : ""}${whole}.${fraction}`;
  }

  private assertSameUnit(other: Quantity): void {
    if (other.uomId !== this.uomId)
      throw new RangeError("Convert quantities to one unit before combining.");
  }
}
