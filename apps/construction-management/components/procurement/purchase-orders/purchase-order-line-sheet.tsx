"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { money } from "@/components/payments/payment-format";
import { MaterialPicker } from "@/components/procurement/material-picker";
import { quantityText } from "@/components/procurement/purchase-requests/purchase-request-format";
import { purchaseRequestQuantityInfoQuery } from "@/src/queries/purchase-requests";
import type { SupplyType } from "@/src/shared-kernel/gst-line";

import {
  lineAmountsOf,
  lineFromMaterial,
  lineSchema,
  type LineValue,
} from "./purchase-order-form-schema";

type Errors = Partial<Record<keyof LineValue, string>>;

const EMPTY: LineValue = {
  key: "",
  materialId: "",
  materialName: "",
  uomName: "",
  purchaseRequestItemId: null,
  quantity: "",
  rate: "",
  discountType: "none",
  discountValue: "",
  gstRate: "",
  hsnCode: "",
  remark: "",
};

/**
 * "Add Materials" (`modules/06` PO form): Material, an info line with
 * Available Stock and Balanced estimated qty, Quantity, Unit Rate,
 * Discount ₹ or %, GST %, HSN, the computed Sub Total / Discount / GST /
 * Total, and a remark. Rate, discount, GST and HSN default from the
 * Material master.
 */
export function PurchaseOrderLineSheet({
  open,
  onOpenChange,
  projectId,
  line,
  usedMaterialIds,
  supplyType,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** The line being edited, or null to add one. */
  line: LineValue | null;
  usedMaterialIds: readonly string[];
  supplyType: SupplyType;
  onSave: (line: LineValue) => void;
}) {
  const [value, setValue] = useState<LineValue>(line ?? EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const info = useQuery({
    ...purchaseRequestQuantityInfoQuery(
      projectId,
      value.materialId === "" ? [] : [value.materialId],
    ),
    enabled: open && value.materialId !== "",
  }).data?.[0];
  const amounts = lineAmountsOf(value, supplyType);
  const set = (patch: Partial<LineValue>) => {
    setValue((current) => ({ ...current, ...patch }));
  };
  const save = () => {
    const parsed = lineSchema.safeParse(value);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof LineValue | undefined;
        if (field != null) next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    if (amounts == null) {
      setErrors({
        discountValue: "A discount cannot be more than the line's amount",
      });
      return;
    }
    onSave({
      ...parsed.data,
      key:
        value.key === ""
          ? `line-${value.materialId}-${String(Date.now())}`
          : value.key,
    });
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {line == null ? "Add Materials" : `Edit ${line.materialName}`}
          </SheetTitle>
          <SheetDescription>
            Rate, discount, GST and HSN come from the Material; change them for
            this order.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="space-y-1.5">
            <Label htmlFor="po-line-material">Material</Label>
            <MaterialPicker
              id="po-line-material"
              value={value.materialId === "" ? null : value.materialId}
              excludeIds={usedMaterialIds.filter(
                (id) => id !== line?.materialId,
              )}
              disabled={line?.purchaseRequestItemId != null}
              invalid={errors.materialId != null}
              onChange={(material) => {
                if (material == null) {
                  set({ materialId: "", materialName: "", uomName: "" });
                  return;
                }
                const defaults = lineFromMaterial(
                  material,
                  value.quantity,
                  value.purchaseRequestItemId,
                );
                setValue({ ...defaults, key: value.key, remark: value.remark });
              }}
            />
            <FieldError message={errors.materialId} />
            {info != null && (
              <p className="text-muted-foreground text-xs">
                Available Stock: {quantityText(info.availableStock)}{" "}
                {value.uomName} · Balanced estimated qty:{" "}
                {info.balancedEstimatedQty == null
                  ? "no estimate"
                  : `${quantityText(info.balancedEstimatedQty)} ${value.uomName}`}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-line-qty">
                Quantity{value.uomName === "" ? "" : ` (${value.uomName})`}
              </Label>
              <Input
                id="po-line-qty"
                inputMode="decimal"
                value={value.quantity}
                aria-invalid={errors.quantity != null}
                onChange={(event) => {
                  set({ quantity: event.target.value });
                }}
              />
              <FieldError message={errors.quantity} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-line-rate">Unit Rate (₹)</Label>
              <Input
                id="po-line-rate"
                inputMode="decimal"
                value={value.rate}
                aria-invalid={errors.rate != null}
                onChange={(event) => {
                  set({ rate: event.target.value });
                }}
              />
              <FieldError message={errors.rate} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-line-discount">Discount</Label>
            <div className="flex gap-2">
              <ToggleGroup
                aria-label="Discount type"
                value={[value.discountType]}
                onValueChange={(next: string[]) => {
                  const type = next[0] as LineValue["discountType"] | undefined;
                  if (type != null)
                    set({
                      discountType: type,
                      discountValue: type === "none" ? "" : value.discountValue,
                    });
                }}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="none">None</ToggleGroupItem>
                <ToggleGroupItem value="amount">₹</ToggleGroupItem>
                <ToggleGroupItem value="percent">%</ToggleGroupItem>
              </ToggleGroup>
              <Input
                id="po-line-discount"
                inputMode="decimal"
                className="min-w-0 flex-1"
                disabled={value.discountType === "none"}
                value={value.discountValue}
                aria-invalid={errors.discountValue != null}
                onChange={(event) => {
                  set({ discountValue: event.target.value });
                }}
              />
            </div>
            <FieldError message={errors.discountValue} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-line-gst">GST Rate %</Label>
              <Input
                id="po-line-gst"
                inputMode="decimal"
                value={value.gstRate}
                aria-invalid={errors.gstRate != null}
                onChange={(event) => {
                  set({ gstRate: event.target.value });
                }}
              />
              <FieldError message={errors.gstRate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-line-hsn">HSN</Label>
              <Input
                id="po-line-hsn"
                inputMode="numeric"
                value={value.hsnCode}
                aria-invalid={errors.hsnCode != null}
                onChange={(event) => {
                  set({ hsnCode: event.target.value });
                }}
              />
              <FieldError message={errors.hsnCode} />
            </div>
          </div>
          <dl
            aria-label="Line amounts"
            className="bg-muted/50 grid grid-cols-2 gap-1 rounded-lg p-3 text-sm"
          >
            <dt className="text-muted-foreground">Sub Total</dt>
            <dd className="text-right tabular-nums">
              {money(amounts == null ? null : Number(amounts.subTotal))}
            </dd>
            <dt className="text-muted-foreground">Discount</dt>
            <dd className="text-right tabular-nums">
              {money(amounts == null ? null : Number(amounts.discountAmount))}
            </dd>
            <dt className="text-muted-foreground">
              {supplyType === "intra_state"
                ? "GST (CGST + SGST)"
                : "GST (IGST)"}
            </dt>
            <dd className="text-right tabular-nums">
              {money(
                amounts == null
                  ? null
                  : Number(amounts.cgst + amounts.sgst + amounts.igst),
              )}
            </dd>
            <dt className="font-medium">Total Amount</dt>
            <dd className="text-right font-medium tabular-nums">
              {money(amounts == null ? null : Number(amounts.total))}
            </dd>
          </dl>
          <div className="space-y-1.5">
            <Label htmlFor="po-line-remark">Remark</Label>
            <Input
              id="po-line-remark"
              maxLength={500}
              value={value.remark}
              onChange={(event) => {
                set({ remark: event.target.value });
              }}
            />
          </div>
        </div>
        <SheetFooter>
          <Button type="button" onClick={save}>
            {line == null ? "Add" : "Save line"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
