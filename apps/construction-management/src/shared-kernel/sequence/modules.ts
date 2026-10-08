/**
 * Modules whose documents get a Sequence ID (`modules/12` "Manage Sequence
 * IDs"). Keys are stored; labels are screen copy; `defaultPrefix` starts the
 * standard rule.
 */
export const SEQUENCE_MODULES = [
  {
    key: "purchase_request",
    label: "Purchase Request (PR)",
    defaultPrefix: "PR",
  },
  { key: "purchase_order", label: "Purchase Order (PO)", defaultPrefix: "PO" },
  {
    key: "goods_receipt",
    label: "Goods Receipt Note (GRN)",
    defaultPrefix: "GRN",
  },
  {
    key: "material_transfer",
    label: "Material Transfer (MT)",
    defaultPrefix: "MT",
  },
  { key: "petty_cash", label: "Petty Cash", defaultPrefix: "PC" },
  {
    key: "material_request",
    label: "Central Store Material Request (MR)",
    defaultPrefix: "MR",
  },
  { key: "delivery_note", label: "Delivery Note (DN)", defaultPrefix: "DN" },
  {
    key: "inspection_request",
    label: "Inspection Request",
    defaultPrefix: "IR",
  },
  {
    key: "other_party_sales_invoice",
    label: "Other Party Sales Invoice",
    defaultPrefix: "INV",
  },
] as const;

export type SequenceModuleKey = (typeof SEQUENCE_MODULES)[number]["key"];
export type SequenceModule = (typeof SEQUENCE_MODULES)[number];

const KEYS = new Set<string>(SEQUENCE_MODULES.map((item) => item.key));

export function isSequenceModuleKey(value: string): value is SequenceModuleKey {
  return KEYS.has(value);
}

export function sequenceModule(key: SequenceModuleKey): SequenceModule {
  const found = SEQUENCE_MODULES.find((item) => item.key === key);
  if (found == null) throw new Error(`Unknown sequence module ${key}`);
  return found;
}
