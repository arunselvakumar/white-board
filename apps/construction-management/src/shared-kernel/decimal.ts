/**
 * Exact decimal arithmetic for the kernel, on bigint. Floats never touch
 * money or quantities.
 */

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d+))?$/;

/** A decimal string as an integer numerator over 10^scale. */
export function parseDecimal(raw: string | number): {
  numerator: bigint;
  scale: number;
} {
  const text = typeof raw === "number" ? numberToPlainString(raw) : raw.trim();
  const match = DECIMAL_RE.exec(text);
  if (match == null) throw new RangeError(`Not a decimal number: ${text}`);
  const [, sign, whole = "0", fraction = ""] = match;
  const numerator = BigInt(`${whole}${fraction}`) * (sign == null ? 1n : -1n);
  return { numerator, scale: fraction.length };
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError("Not a finite number.");
  // Up to 20 significant fraction digits without exponent notation.
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
}

/** numerator / denominator rounded half away from zero. */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero.");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}
