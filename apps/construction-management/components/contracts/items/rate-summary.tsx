import { Calculator } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { gapOf, money, type AnalysisTotals } from "./item-form-schema";

/** "8.33 %" with a sign the sentence already gives. */
function percentText(percent: number): string {
  return `${Math.abs(percent).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })} %`;
}

/**
 * The analysed rate against the adopted one (ADR CM-0023 §3): the lines'
 * total, the overhead and profit, the analysed rate, and how far the
 * adopted rate is from it in rupees and percent. "Use analysed rate" copies
 * it into the adopted rate.
 */
export function RateSummary({
  totals,
  overheadPercent,
  adoptedRate,
  onUseAnalysed,
}: {
  totals: AnalysisTotals;
  /** As typed, for the label. */
  overheadPercent: string;
  /** Paise; null while the field is blank or wrong. */
  adoptedRate: number | null;
  onUseAnalysed: (paise: number) => void;
}) {
  const { analysed } = totals;
  const gap = gapOf(adoptedRate, analysed);
  const same = gap?.paise === 0;
  let sentence: string;
  if (analysed == null)
    sentence = "Complete every line to see the analysed rate.";
  else if (gap == null) sentence = "Enter the adopted rate to compare.";
  else if (same) sentence = "The adopted rate matches the analysed rate.";
  else
    sentence = `The adopted rate is ${money(Math.abs(gap.paise))}${
      gap.percent == null ? "" : ` (${percentText(gap.percent)})`
    } ${gap.paise > 0 ? "above" : "below"} the analysed rate.`;
  const overheadLabel =
    overheadPercent.trim() === ""
      ? "Overhead and profit"
      : `Overhead and profit (${overheadPercent.trim()} %)`;

  return (
    <section
      aria-label="Analysed and adopted rate"
      className="bg-muted/40 space-y-3 rounded-xl border p-4"
    >
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Lines total</dt>
          <dd className="tabular-nums">{money(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{overheadLabel}</dt>
          <dd className="tabular-nums">{money(totals.overhead)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-medium">
          <dt>Analysed rate</dt>
          <dd className="tabular-nums">{money(analysed)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-medium">
          <dt>Adopted rate</dt>
          <dd className="tabular-nums">{money(adoptedRate)}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:col-span-2">
          <dt className="text-muted-foreground">Gap</dt>
          <dd
            className={cn(
              "tabular-nums",
              gap != null &&
                !same &&
                (gap.paise > 0
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-sky-700 dark:text-sky-400"),
            )}
          >
            {gap == null
              ? "—"
              : `${gap.paise > 0 ? "+" : gap.paise < 0 ? "−" : ""}${money(Math.abs(gap.paise))}${
                  gap.percent == null
                    ? ""
                    : ` (${gap.paise < 0 ? "−" : gap.paise > 0 ? "+" : ""}${percentText(gap.percent)})`
                }`}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-muted-foreground text-sm">
          {sentence}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={analysed == null || same}
          onClick={() => {
            if (analysed != null) onUseAnalysed(analysed);
          }}
        >
          <Calculator aria-hidden="true" />
          Use analysed rate
        </Button>
      </div>
    </section>
  );
}
