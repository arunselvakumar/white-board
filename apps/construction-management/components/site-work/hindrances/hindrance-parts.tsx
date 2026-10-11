import { Badge } from "@repo/ui/components/badge";

import { formatDate } from "@/components/procurement/inventory/inventory-format";
import {
  HINDRANCE_STATUS_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  type HindranceStatus,
} from "@/src/site-work/domain/hindrance";
import type { Hindrance } from "@/src/queries/hindrances";

export function HindranceStatusBadge({ status }: { status: HindranceStatus }) {
  return status === "open" ? (
    <Badge
      variant="outline"
      className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
    >
      {HINDRANCE_STATUS_LABELS.open}
    </Badge>
  ) : (
    <Badge variant="secondary">{HINDRANCE_STATUS_LABELS.closed}</Badge>
  );
}

/** "5 Oct 2026 – 7 Oct 2026", or "5 Oct 2026 – continuing". */
export function hindrancePeriod(
  hindrance: Pick<Hindrance, "startDate" | "endDate">,
): string {
  const start = formatDate(hindrance.startDate);
  if (hindrance.endDate == null) return `${start} – continuing`;
  if (hindrance.endDate === hindrance.startDate) return start;
  return `${start} – ${formatDate(hindrance.endDate)}`;
}

/** "3 days lost · 16.5 hours". */
export function lostSummary(
  hindrance: Pick<Hindrance, "daysLost" | "hoursLost" | "status">,
): string {
  const days = `${String(hindrance.daysLost)} ${hindrance.daysLost === 1 ? "day" : "days"}${hindrance.status === "open" ? " so far" : ""}`;
  if (hindrance.hoursLost == null) return days;
  const hours = Number(hindrance.hoursLost);
  return `${days} · ${hindrance.hoursLost} ${hours === 1 ? "hour" : "hours"}`;
}

/** "Contractor · Velan Constructions", or the party alone. */
export function partyLabel(
  hindrance: Pick<Hindrance, "responsibleParty" | "contractor">,
): string {
  const party = RESPONSIBLE_PARTY_LABELS[hindrance.responsibleParty];
  if (hindrance.contractor == null) return party;
  return `${party} · ${hindrance.contractor.name ?? "A removed Contractor"}`;
}
