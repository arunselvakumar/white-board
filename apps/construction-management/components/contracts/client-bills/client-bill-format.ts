/** Client Bills print and show bills as Contractor Bills do (CM-1107). */
export {
  BillStatusBadge,
  billNumber,
  dateText,
  moneyOrDash,
  percentText,
  quantity,
  raLabel,
  rowWorking,
  whenText,
} from "../contractor-bills/contractor-bill-format";

/** `33` and `Tamil Nadu` → `Tamil Nadu (33)`. */
export function stateText(
  place: { stateCode: string | null; stateName: string | null } | null,
): string {
  if (place?.stateCode == null) return "—";
  return place.stateName == null
    ? place.stateCode
    : `${place.stateName} (${place.stateCode})`;
}
