import { divideRounded, parseDecimal, pow10 } from "./decimal";

/**
 * An amount of money in the smallest unit (paise for INR) and its currency
 * (ADR CM-0004, `03-target-architecture.md §3`). Never a float.
 */
export class Money {
  private constructor(
    /** Integer minor units: paise for INR. */
    readonly minor: number,
    /** ISO 4217. */
    readonly currency: string,
  ) {}

  static ofMinor(minor: number, currency = "INR"): Money {
    if (!Number.isSafeInteger(minor))
      throw new RangeError("Money is a whole number of paise.");
    if (!/^[A-Z]{3}$/.test(currency))
      throw new RangeError(`Not an ISO 4217 currency: ${currency}`);
    return new Money(minor, currency);
  }

  static zero(currency = "INR"): Money {
    return Money.ofMinor(0, currency);
  }

  /** From rupees as a decimal string or number, rounded half up to the paisa. */
  static ofMajor(major: string | number, currency = "INR"): Money {
    const { numerator, scale } = parseDecimal(major);
    const minor = divideRounded(numerator * 100n, pow10(scale));
    return Money.ofMinor(Number(minor), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.ofMinor(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.ofMinor(this.minor - other.minor, this.currency);
  }

  /**
   * Multiplies by an exact decimal factor (a quantity, a rate, a GST
   * percentage as 0.18) and rounds half away from zero to the paisa.
   */
  multiply(factor: string | number): Money {
    const { numerator, scale } = parseDecimal(factor);
    const minor = divideRounded(BigInt(this.minor) * numerator, pow10(scale));
    return Money.ofMinor(Number(minor), this.currency);
  }

  isZero(): boolean {
    return this.minor === 0;
  }

  isNegative(): boolean {
    return this.minor < 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.minor === other.minor ? 0 : this.minor < other.minor ? -1 : 1;
  }

  /** `₹1,00,000.00` for INR (Indian grouping); the locale's form otherwise. */
  format(): string {
    return formatMinor(this.minor, this.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency)
      throw new RangeError(
        `Cannot combine ${this.currency} with ${other.currency}.`,
      );
  }
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Formats minor units: `₹1,00,000.00` for INR. */
export function formatMinor(minor: number, currency = "INR"): string {
  let formatter = formatters.get(currency);
  if (formatter == null) {
    formatter = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  return formatter.format(minor / 100);
}
