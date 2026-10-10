import type { DocumentNaming } from "@/src/shared-kernel/approval";
import type { BackdatedModuleKey } from "@/src/shared-kernel/backdated-policy";
import type { MenuKey } from "@/src/shared-kernel/access/menus";
import type { SequenceModuleKey } from "@/src/shared-kernel/sequence";

/**
 * The six procurement documents and what each one is wired to: its
 * numbering module (CM-114), back-dated module (CM-113), Permission Matrix
 * menu (CM-107) and the naming its errors use (ADR CM-0015 §13).
 */
export const PROCUREMENT_DOCUMENT_TYPES = [
  "purchase_request",
  "purchase_order",
  "goods_receipt",
  "material_transfer",
  "material_request",
  "delivery_note",
] as const;
export type ProcurementDocumentType =
  (typeof PROCUREMENT_DOCUMENT_TYPES)[number];

export type ProcurementDocument = {
  type: ProcurementDocumentType;
  naming: DocumentNaming;
  sequence: SequenceModuleKey;
  backdated: BackdatedModuleKey;
  menu: MenuKey;
  /** Whether the menu is checked against a Project (`projectScoped`). */
  projectScoped: boolean;
};

export const PROCUREMENT_DOCUMENTS: Record<
  ProcurementDocumentType,
  ProcurementDocument
> = {
  purchase_request: {
    type: "purchase_request",
    naming: { code: "PURCHASE_REQUEST", label: "Purchase Request" },
    sequence: "purchase_request",
    backdated: "purchase_request",
    menu: "procurement.purchase_requests",
    projectScoped: true,
  },
  purchase_order: {
    type: "purchase_order",
    naming: { code: "PURCHASE_ORDER", label: "Purchase Order" },
    sequence: "purchase_order",
    backdated: "purchase_order",
    menu: "procurement.purchase_orders",
    projectScoped: true,
  },
  goods_receipt: {
    type: "goods_receipt",
    naming: { code: "GOODS_RECEIPT", label: "Goods Receipt" },
    sequence: "goods_receipt",
    backdated: "goods_receipt",
    menu: "procurement.material_received",
    projectScoped: true,
  },
  material_transfer: {
    type: "material_transfer",
    naming: { code: "MATERIAL_TRANSFER", label: "Material Transfer" },
    sequence: "material_transfer",
    backdated: "material_transfer",
    menu: "procurement.material_transfers",
    projectScoped: true,
  },
  material_request: {
    type: "material_request",
    naming: { code: "MATERIAL_REQUEST", label: "Material Request" },
    sequence: "material_request",
    backdated: "material_request",
    menu: "procurement.material_requests",
    projectScoped: false,
  },
  delivery_note: {
    type: "delivery_note",
    naming: { code: "DELIVERY_NOTE", label: "Delivery Note" },
    sequence: "delivery_note",
    backdated: "delivery_note",
    menu: "procurement.delivery_notes",
    projectScoped: false,
  },
};

export function isProcurementDocumentType(
  value: string,
): value is ProcurementDocumentType {
  return (PROCUREMENT_DOCUMENT_TYPES as readonly string[]).includes(value);
}
