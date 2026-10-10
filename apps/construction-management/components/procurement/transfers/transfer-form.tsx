"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import {
  formatQuantity,
  localToday,
  QUANTITY_PATTERN,
} from "@/components/procurement/inventory/inventory-format";
import { StockErrorAlert } from "@/components/procurement/inventory/stock-error-alert";
import { MaterialPicker } from "@/components/procurement/material-picker";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { QueryHttpError } from "@/src/queries/http";
import { materialOptionsQuery } from "@/src/queries/material-options";
import {
  transferLocationsQuery,
  transferStockQuery,
  useCreateTransfer,
  useUpdateTransfer,
  type MaterialTransfer,
} from "@/src/queries/material-transfers";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import { storeFlag } from "@/src/procurement/application/inventory-access";

import { locationValue, parseLocationValue } from "./transfer-parts";

const schema = z
  .object({
    transferDate: z.string().min(1, "Choose the transfer date."),
    from: z.string().min(1, "Choose where the material goes from."),
    to: z.string().min(1, "Choose where the material goes to."),
    lines: z
      .array(
        z.object({
          materialId: z.string().min(1, "Choose a material."),
          quantity: z
            .string()
            .trim()
            .regex(QUANTITY_PATTERN, "Enter a quantity with at most 3 decimals.")
            .refine((value) => Number(value) > 0, "Enter a quantity more than 0."),
          remark: z.string().max(500, "Use at most 500 characters."),
        }),
      )
      .min(1, "Add a material.")
      .max(100),
    receiverName: z.string().trim().max(120, "Use at most 120 characters."),
    remark: z.string().max(500, "Use at most 500 characters."),
  })
  .refine((value) => value.from === "" || value.from !== value.to, {
    message: "Choose a destination other than the source.",
    path: ["to"],
  });
type Values = z.infer<typeof schema>;

const SERVER_FIELDS = {
  TRANSFER_SAME_LOCATION: "to",
  TRANSFER_DATE_IN_FUTURE: "transferDate",
  BACKDATED_CREATE_BLOCKED: "transferDate",
  BACKDATED_EDIT_BLOCKED: "transferDate",
  FINANCIAL_PERIOD_CLOSED: "transferDate",
  STORE_NOT_FOUND: "to",
  PROJECT_NOT_FOUND: "to",
} as const;

function blankLine(materialId = ""): Values["lines"][number] {
  return { materialId, quantity: "", remark: "" };
}

/** Available stock at the source on the transfer date, per material. */
function useAvailable(
  from: StockLocation | null,
  materialIds: string[],
  on: string,
): ReadonlyMap<string, string> | null {
  const { data } = useQuery(transferStockQuery(from, materialIds, on));
  return data == null ? null : new Map(Object.entries(data));
}

/**
 * New or edit Material Transfer (CM-507): Transfer Date, From and To (a
 * Project or a Store; not the same), lines of material, quantity and
 * remark with the stock available at the source, Receiver Name and a
 * remark. **Save** leaves it pending (nothing moves); **Save & Approve**,
 * for members who may approve at the source, dispatches it at once.
 */
export function TransferForm({
  defaultFrom,
  transfer,
  materialIds = [],
  hrefFor,
}: {
  /** Where a new transfer starts from (the page's Project). */
  defaultFrom: StockLocation;
  /** Edit this pending transfer. */
  transfer?: MaterialTransfer;
  /** Lines to start with (`?materials=` from Current Inventory). */
  materialIds?: readonly string[];
  /** Where to go after saving. */
  hrefFor: (id: string) => string;
}) {
  const router = useRouter();
  const { data: places } = useSuspenseQuery(transferLocationsQuery);
  const create = useCreateTransfer();
  const update = useUpdateTransfer(transfer?.id ?? "");
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues:
      transfer == null
        ? {
            transferDate: localToday(),
            from: locationValue(defaultFrom),
            to: "",
            lines:
              materialIds.length > 0
                ? materialIds.map((id) => blankLine(id))
                : [blankLine()],
            receiverName: "",
            remark: "",
          }
        : {
            transferDate: transfer.transferDate,
            from: locationValue(transfer.from),
            to: locationValue(transfer.to),
            lines: transfer.lines.map((line) => ({
              materialId: line.materialId,
              quantity: String(Number(line.quantity)),
              remark: line.remark ?? "",
            })),
            receiverName: transfer.receiverName ?? "",
            remark: transfer.remark ?? "",
          },
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const values = form.watch();
  const errors = form.formState.errors;
  const from = parseLocationValue(values.from);
  const chosen = values.lines.map((line) => line.materialId).filter(Boolean);
  const available = useAvailable(from, chosen, values.transferDate);
  const { data: materials = [] } = useQuery(
    materialOptionsQuery({ ids: chosen }),
  );
  const uomOf = new Map(materials.map((item) => [item.id, item.uomName]));

  // Save & Approve needs Approve at the source.
  const { data: sourceAccess } = useQuery(
    procurementAccessQuery(from?.kind === "project" ? from.id : null),
  );
  const canApprove =
    from != null &&
    sourceAccess != null &&
    canIn(sourceAccess, "procurement.material_transfers", "approve") &&
    (from.kind === "project" ||
      canIn(sourceAccess, "procurement.central_store", storeFlag("approve")));

  const options = [
    {
      label: "Projects",
      items: places.projects.map((project) => ({
        value: locationValue({ kind: "project", id: project.id }),
        label: project.name,
      })),
    },
    {
      label: "Stores",
      items: places.stores.map((store) => ({
        value: locationValue({ kind: "store", id: store.id }),
        label: store.name,
      })),
    },
  ].filter((group) => group.items.length > 0);
  const items = options.flatMap((group) => group.items);

  const submit = async (input: Values, approve: boolean) => {
    setError(null);
    const source = parseLocationValue(input.from);
    const destination = parseLocationValue(input.to);
    if (source == null || destination == null) return;
    const body = {
      transferDate: input.transferDate,
      from: source,
      to: destination,
      lines: input.lines.map((line) => ({
        materialId: line.materialId,
        quantity: line.quantity.trim(),
        remark: line.remark.trim() === "" ? null : line.remark.trim(),
      })),
      receiverName: input.receiverName.trim() === "" ? null : input.receiverName.trim(),
      remark: input.remark.trim() === "" ? null : input.remark.trim(),
    };
    try {
      const saved =
        transfer == null
          ? await create.mutateAsync({ ...body, approve })
          : await update.mutateAsync({
              ...body,
              expectedUpdatedAt: transfer.updatedAt,
            });
      router.push(hrefFor(saved.id));
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        const field =
          SERVER_FIELDS[caught.code as keyof typeof SERVER_FIELDS] ?? null;
        if (field != null) {
          form.setError(field, { message: caught.message });
          return;
        }
      }
      setError(caught);
    }
  };

  const locationSelect = (
    name: "from" | "to",
    label: string,
    exclude: string | null,
  ) => (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`transfer-${name}`}>{label}</Label>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Select
            items={items}
            value={field.value === "" ? null : field.value}
            onValueChange={(value) => {
              if (value != null) field.onChange(value);
            }}
          >
            <SelectTrigger
              id={`transfer-${name}`}
              className="w-full min-w-0"
              aria-invalid={errors[name] != null}
            >
              <SelectValue placeholder="Choose a Project or Store" />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {options.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.items
                    .filter((item) => item.value !== exclude)
                    .map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError message={errors[name]?.message} />
    </div>
  );

  const busy = form.formState.isSubmitting;

  return (
    <form
      noValidate
      aria-label={transfer == null ? "New Material Transfer" : `Edit ${transfer.number}`}
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit((input) => submit(input, false))(event);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="transfer-date">Transfer Date</Label>
          <Input
            id="transfer-date"
            type="date"
            max={localToday()}
            aria-invalid={errors.transferDate != null}
            {...form.register("transferDate")}
          />
          <FieldError message={errors.transferDate?.message} />
        </div>
        {locationSelect("from", "From", null)}
        {locationSelect("to", "To", values.from)}
      </div>

      <section aria-labelledby="transfer-lines" className="space-y-3">
        <h3 id="transfer-lines" className="text-sm font-semibold">
          Transferred material
        </h3>
        <ol className="space-y-3">
          {lines.fields.map((field, index) => {
            const line = values.lines[index];
            const lineErrors = errors.lines?.[index];
            const id = (name: string) => `transfer-${String(index)}-${name}`;
            const stock =
              line == null || line.materialId === "" ? null : (available?.get(line.materialId) ?? null);
            const unit = line == null ? undefined : uomOf.get(line.materialId);
            const short =
              stock != null &&
              line != null &&
              QUANTITY_PATTERN.test(line.quantity.trim()) &&
              Number(line.quantity) > Number(stock);
            return (
              <li
                key={field.id}
                aria-label={`Material ${String(index + 1)}`}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_9rem_1fr_auto] sm:items-start"
              >
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={id("material")}>Material</Label>
                  <Controller
                    control={form.control}
                    name={`lines.${index}.materialId`}
                    render={({ field: control }) => (
                      <MaterialPicker
                        id={id("material")}
                        value={control.value === "" ? null : control.value}
                        excludeIds={chosen.filter((value) => value !== control.value)}
                        invalid={lineErrors?.materialId != null}
                        onChange={(material) => {
                          control.onChange(material?.id ?? "");
                        }}
                      />
                    )}
                  />
                  <FieldError message={lineErrors?.materialId?.message} />
                  {stock != null && (
                    <p
                      className={short ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
                    >
                      Available: {formatQuantity(stock)}
                      {unit == null ? "" : ` ${unit}`}
                      {short && " — not enough to approve"}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("quantity")}>
                    Quantity{unit == null ? "" : ` (${unit})`}
                  </Label>
                  <Input
                    id={id("quantity")}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={lineErrors?.quantity != null}
                    {...form.register(`lines.${index}.quantity`)}
                  />
                  <FieldError message={lineErrors?.quantity?.message} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={id("remark")}>Remarks</Label>
                  <Input
                    id={id("remark")}
                    autoComplete="off"
                    aria-invalid={lineErrors?.remark != null}
                    {...form.register(`lines.${index}.remark`)}
                  />
                  <FieldError message={lineErrors?.remark?.message} />
                </div>
                {lines.fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="sm:mt-6"
                    aria-label={`Remove material ${String(index + 1)}`}
                    onClick={() => {
                      lines.remove(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
        {lines.fields.length < 100 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              lines.append(blankLine());
            }}
          >
            <Plus aria-hidden="true" />
            Add material
          </Button>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="transfer-receiver">Receiver Name</Label>
          <Input
            id="transfer-receiver"
            autoComplete="off"
            aria-invalid={errors.receiverName != null}
            {...form.register("receiverName")}
          />
          <FieldError message={errors.receiverName?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="transfer-remark">Remark</Label>
          <Textarea
            id="transfer-remark"
            rows={2}
            aria-invalid={errors.remark != null}
            {...form.register("remark")}
          />
          <FieldError message={errors.remark?.message} />
        </div>
      </div>

      <StockErrorAlert error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.back();
          }}
        >
          Cancel
        </Button>
        {transfer == null && canApprove && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void form.handleSubmit((input) => submit(input, true))();
            }}
          >
            Save &amp; Approve
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
