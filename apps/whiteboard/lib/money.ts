export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function paiseToRupeesInput(paise: number): string {
  const rupees = paiseToRupees(paise);
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

export function formatPaiseAsRupees(paise: number): string {
  return `₹${paiseToRupees(paise).toLocaleString("en-IN")}`;
}

export function parseRupeesInput(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    return null;
  }
  return rupeesToPaise(Number(value));
}
