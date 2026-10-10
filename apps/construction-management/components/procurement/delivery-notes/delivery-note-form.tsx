"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  centralStoreHref,
  formatQuantity,
} from "@/components/procurement/stores/central-store-parts";
import { fieldForCode } from "@/lib/server-errors";
import {
  useCreateDeliveryNote,
  useUpdateDeliveryNote,
  type DeliveryNote,
} from "@/src/queries/delivery-notes";
import { materialRequestQuery } from "@/src/queries/material-requests";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import { storeStockQuery } from "@/src/queries/stores";

const QUANTITY = /^\d{1,11}(\.\d{1,3})?$/;

const SERVER_FIELDS = {
  DATE_IN_FUTURE: "deliveryDate",
  BACKDATED_CREATE_BLOCKED: "deliveryDate",
  BACKDATED_EDIT_BLOCKED: "deliveryDate",
  FINANCIAL_PERIOD_CLOSED: "deliveryDate",
} as const;

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

function trimmed(decimal: string): string {
  return decimal.includes(".") ? decimal.replace(/\.?0+$/, "") : decimal;
}

/**
 * Create Delivery Note from a Material Request, or edit a pending one
 * (CM-508): per material Requested, Pending and Delivered now (at most
 * the pending quantity and the store's stock), the delivery date,
 * Delivered To and a remark. Save keeps it pending; Save & Approve
 * dispatches it at once.
 */
export function DeliveryNoteForm({
  materialRequestId,
  note,
}: {
  materialRequestId: string;
  note?: DeliveryNote;
}) {
  const router = useRouter();
  const { data: request } = useSuspenseQuery(
    materialRequestQuery(materialRequestId),
  );
  const access = useQuery(procurementAccessQuery(null)).data;
  const canApprove =
    access != null && canIn(access, "procurement.delivery_notes", "approve");
  const canSeeStock =
    access != null && canIn(access, "procurement.central_store", "read");
  const stock = useQuery({
    ...storeStockQuery(request.storeId),
    enabled: canSeeStock,
  }).data;
  const create = useCreateDeliveryNote(materialRequestId);
  const update = useUpdateDeliveryNote(note?.id ?? "");

  const onNote = new Map(
    note?.items.map((item) => [item.materialRequestItemId, item]),
  );
  const lines = request.items
    .map((item) => {
      const mine = onNote.get(item.id);
      return {
        id: item.id,
        materialId: item.materialId,
        materialName: item.materialName,
        uomName: item.uomName,
        askQty: item.askQty,
        pendingQty: mine?.pendingQty ?? item.pendingQty,
        current: mine?.quantity,
      };
    })
    .filter((line) => Number(line.pendingQty) > 0 || line.current != null);
  const stockOf = new Map(stock?.map((row) => [row.materialId, row.stock]));

  const schema = useMemo(
    () =>
      z
        .object({
          deliveryDate: z.iso.date("Choose the delivery date."),
          deliveredTo: z.string().max(200, "Use at most 200 characters."),
          remark: z.string().max(500, "Use at most 500 characters."),
          quantities: z.record(z.string(), z.string()),
        })
        .superRefine((values, context) => {
          for (const line of lines) {
            const raw = (values.quantities[line.id] ?? "").trim();
            if (raw === "" || Number(raw) === 0) continue;
            if (!QUANTITY.test(raw))
              context.addIssue({
                code: "custom",
                path: ["quantities", line.id],
                message: "Enter a quantity with at most 3 decimals.",
              });
            else if (Number(raw) > Number(line.pendingQty))
              context.addIssue({
                code: "custom",
                path: ["quantities", line.id],
                message: `At most ${formatQuantity(line.pendingQty)} is pending.`,
              });
          }
        }),
    [lines],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      deliveryDate: note?.deliveryDate ?? today(),
      deliveredTo: note?.deliveredTo ?? request.receiverName ?? "",
      remark: note?.remark ?? "",
      // A new note offers each line's pending quantity; an edited note keeps
      // what it carries and leaves the request's other lines empty.
      quantities: Object.fromEntries(
        lines.map((line) => [
          line.id,
          line.current != null
            ? trimmed(line.current)
            : note == null
              ? trimmed(line.pendingQty)
              : "",
        ]),
      ),
    },
  });
  const errors = form.formState.errors;
  const lineError = (id: string): string | undefined =>
    (errors.quantities as Record<string, { message?: string }> | undefined)?.[
      id
    ]?.message;
  // Which submit button was pressed: Save or Save & Approve.
  const approve = useRef(false);

  const save = async (values: Values) => {
    const items = lines.flatMap((line) => {
      const raw = (values.quantities[line.id] ?? "").trim();
      return raw === "" || Number(raw) === 0
        ? []
        : [{ materialRequestItemId: line.id, quantity: raw }];
    });
    if (items.length === 0) {
      form.setError("root", {
        message: "Enter a delivered quantity for at least one material.",
      });
      return;
    }
    const input = {
      deliveryDate: values.deliveryDate,
      deliveredTo: values.deliveredTo.trim() === "" ? null : values.deliveredTo,
      remark: values.remark.trim() === "" ? null : values.remark,
      items,
    };
    try {
      const saved =
        note == null
          ? await create.mutateAsync({ ...input, approve: approve.current })
          : await update.mutateAsync({
              ...input,
              expectedUpdatedAt: note.updatedAt,
            });
      router.push(centralStoreHref.note(saved.id));
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };
  const saving = form.formState.isSubmitting;

  const back =
    note == null
      ? { label: request.number, href: centralStoreHref.request(request.id) }
      : { label: note.number, href: centralStoreHref.note(note.id) };

  return (
    <div className="w-full max-w-4xl space-y-6">
      <PageHeader
        back={back}
        title={note == null ? "Create Delivery Note" : `Edit ${note.number}`}
        meta={`${request.number} · ${request.storeName ?? "Store"} → ${request.projectName ?? "Project"}`}
      />
      <form
        noValidate
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit(save)(event);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dn-date">Delivery Date</Label>
            <Input
              id="dn-date"
              type="date"
              className="h-10"
              max={today()}
              aria-invalid={errors.deliveryDate != null}
              {...form.register("deliveryDate")}
            />
            <FieldError message={errors.deliveryDate?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dn-to">Delivered To</Label>
            <Input
              id="dn-to"
              className="h-10"
              autoComplete="off"
              {...form.register("deliveredTo")}
            />
            <FieldError message={errors.deliveredTo?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="dn-remark">Remark</Label>
            <Textarea id="dn-remark" rows={2} {...form.register("remark")} />
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="font-semibold">Materials</h2>
          <ul aria-label="Materials to deliver" className="space-y-3">
            {lines.map((line) => {
              const inStore = stockOf.get(line.materialId);
              return (
                <li
                  key={line.id}
                  className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_minmax(0,1.2fr)] sm:items-center"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {line.materialName}
                    </span>
                    {inStore == null ? null : (
                      <span className="text-muted-foreground block text-xs">
                        In store: {formatQuantity(inStore)} {line.uomName}
                      </span>
                    )}
                  </div>
                  <div className="text-sm tabular-nums">
                    <span className="text-muted-foreground block text-xs">
                      Requested
                    </span>
                    {formatQuantity(line.askQty)} {line.uomName}
                  </div>
                  <div className="text-sm tabular-nums">
                    <span className="text-muted-foreground block text-xs">
                      Pending
                    </span>
                    {formatQuantity(line.pendingQty)}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`dn-qty-${line.id}`} className="text-xs">
                      Delivered now
                    </Label>
                    <Input
                      id={`dn-qty-${line.id}`}
                      inputMode="decimal"
                      className="h-10"
                      aria-label={`Delivered now: ${line.materialName}`}
                      aria-invalid={lineError(line.id) != null}
                      {...form.register(`quantities.${line.id}`)}
                    />
                    <FieldError message={lineError(line.id)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <FormAlert message={errors.root?.message} />
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={saving}
            onClick={() => {
              approve.current = false;
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          {note == null && canApprove ? (
            <Button
              type="submit"
              variant="outline"
              disabled={saving}
              onClick={() => {
                approve.current = true;
              }}
            >
              Save &amp; Approve
            </Button>
          ) : null}
          <Link
            href={back.href}
            className={buttonVariants({ variant: "ghost" })}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
