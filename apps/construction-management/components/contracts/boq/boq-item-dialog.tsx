"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  ResourcePicker,
  type PickerOption,
} from "@/components/contracts/items/resource-picker";
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  BOQ_ITEM_DESCRIPTION_MAX,
  BOQ_ITEM_NO_MAX,
  boqQuantity,
} from "@/src/contracts/domain/boq";
import { isValidSacHsn } from "@/src/contracts/domain/item";
import {
  boqFormOptionsQuery,
  boqLibraryItemsQuery,
  useCreateBoqItem,
  useUpdateBoqItem,
  type BoqItem,
  type BoqLibraryItem,
} from "@/src/queries/contracts-boq";

import { money, quantityInput } from "./boq-format";

const NONE = "__none__";
const SEARCH_DELAY_MS = 250;

const schema = z.object({
  sectionId: z.string().min(1, "Pick the section"),
  itemNo: z
    .string()
    .trim()
    .min(1, "Enter the item number")
    .max(BOQ_ITEM_NO_MAX, `Use at most ${String(BOQ_ITEM_NO_MAX)} characters`),
  description: z
    .string()
    .trim()
    .min(1, "Enter the description")
    .max(
      BOQ_ITEM_DESCRIPTION_MAX,
      `Use at most ${BOQ_ITEM_DESCRIPTION_MAX.toLocaleString("en-IN")} characters`,
    ),
  uomId: z.string().min(1, "Pick the UoM"),
  sacHsn: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidSacHsn(value), {
      message: "SAC or HSN is 4 to 8 digits",
    }),
  quantity: z
    .string()
    .trim()
    .refine((value) => boqQuantity(value) != null, {
      message: "More than 0, with at most four decimals",
    }),
  rate: z.string(),
  place: z.string(),
});

type Values = z.infer<typeof schema>;
type Field = keyof Values;

const SERVER_FIELDS: Partial<Record<string, Field>> = {
  BOQ_ITEM_NO_TAKEN: "itemNo",
  BOQ_ITEM_NO_REQUIRED: "itemNo",
  BOQ_ITEM_NO_TOO_LONG: "itemNo",
  BOQ_ITEM_DESCRIPTION_REQUIRED: "description",
  BOQ_ITEM_DESCRIPTION_TOO_LONG: "description",
  BOQ_ITEM_UOM_INVALID: "uomId",
  SAC_HSN_INVALID: "sacHsn",
  BOQ_QUANTITY_INVALID: "quantity",
  BOQ_AMOUNT_TOO_LARGE: "quantity",
  BOQ_RATE_INVALID: "rate",
  BOQ_ITEM_WING_INVALID: "place",
  BOQ_ITEM_LOCATION_INVALID: "place",
  BOQ_SECTION_NOT_FOUND: "sectionId",
};

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

type LibraryPick = PickerOption & { item: BoqLibraryItem };

function toPick(item: BoqLibraryItem): LibraryPick {
  return {
    id: item.id,
    label: `${item.code} · ${item.shortDescription}`,
    detail: [
      item.uomName,
      item.adoptedRate == null ? null : money(item.adoptedRate),
    ]
      .filter((part): part is string => part != null && part !== "")
      .join(" · "),
    item,
  };
}

/** The Item Library picker: a server search by code or description. */
function LibraryPicker({
  id,
  projectId,
  value,
  onChange,
}: {
  id: string;
  projectId: string;
  value: LibraryPick | null;
  onChange: (pick: LibraryPick | null) => void;
}) {
  const [query, setQuery] = useState("");
  const search = useDebounced(query, SEARCH_DELAY_MS);
  const results = useQuery({
    ...boqLibraryItemsQuery(projectId, search),
    placeholderData: keepPreviousData,
  });
  const options = useMemo(
    () => (results.data ?? []).map(toPick),
    [results.data],
  );
  return (
    <ResourcePicker<LibraryPick>
      id={id}
      label="Item Library"
      noun="Items"
      placeholder="Search the Item Library by code or description"
      options={options}
      value={value}
      onChange={onChange}
      onQueryChange={setQuery}
      loading={results.isPending}
    />
  );
}

/**
 * Add or edit a BOQ item (CM-1103, ADR CM-0023 §4): typed, or filled from
 * the Item Library (code as the item number, description, UoM, SAC/HSN and
 * the adopted rate; the link is kept). Without BOQ Financial there is no
 * rate field. Once a checked measurement names the item its quantity and
 * rate change only through a Variation, so they are read-only here.
 */
export function BoqItemDialog({
  projectId,
  financial,
  item,
  sectionId,
  onClose,
}: {
  projectId: string;
  /** The caller holds BOQ Financial. */
  financial: boolean;
  /** Null to add. */
  item: BoqItem | null;
  /** The section to add to. */
  sectionId?: string;
  onClose: () => void;
}) {
  const id = useId();
  const { data: options } = useSuspenseQuery(boqFormOptionsQuery(projectId));
  const create = useCreateBoqItem();
  const update = useUpdateBoqItem(item?.id ?? "");
  const [library, setLibrary] = useState<LibraryPick | null>(null);
  const measured = item?.measured === true;
  const places =
    options.structure === "wings"
      ? options.wings.map((wing) => ({
          value: wing.id,
          label: `${wing.name} · ${wing.phaseName}`,
        }))
      : options.locations.map((location) => ({
          value: location.id,
          label: location.name,
        }));
  const placeWord = options.structure === "wings" ? "Wing" : "Location";
  const currentPlace = item?.wingId ?? item?.locationId ?? null;
  const placeItems = [
    { value: NONE, label: `No ${placeWord}` },
    ...places,
    ...(currentPlace != null && !places.some((p) => p.value === currentPlace)
      ? [{ value: currentPlace, label: item?.placeName ?? placeWord }]
      : []),
  ];
  const sectionItems = options.sections.map((section) => ({
    value: section.id,
    label: section.title,
  }));
  const uomItems = [
    ...options.uoms.map((uom) => ({ value: uom.id, label: uom.name })),
    ...(item != null && !options.uoms.some((uom) => uom.id === item.uomId)
      ? [{ value: item.uomId, label: item.uomName }]
      : []),
  ];

  const form = useForm<Values>({
    resolver: zodResolver(
      schema.superRefine((values, context) => {
        if (financial && !measured && !isRupees(values.rate))
          context.addIssue({
            code: "custom",
            path: ["rate"],
            message: "Enter the rate in rupees, like 6123.45",
          });
      }),
    ),
    defaultValues: {
      sectionId: item?.sectionId ?? sectionId ?? options.sections[0]?.id ?? "",
      itemNo: item?.itemNo ?? "",
      description: item?.description ?? "",
      uomId: item?.uomId ?? "",
      sacHsn: item?.sacHsn ?? "",
      quantity: quantityInput(item?.quantity),
      rate: paiseToRupees(item?.rate ?? null),
      place: currentPlace ?? NONE,
    },
  });
  const errors = form.formState.errors;

  const pick = (next: LibraryPick | null) => {
    setLibrary(next);
    if (next == null) return;
    const chosen = next.item;
    if (form.getValues("itemNo").trim() === "")
      form.setValue("itemNo", chosen.code);
    form.setValue("description", chosen.description ?? chosen.shortDescription);
    if (options.uoms.some((uom) => uom.id === chosen.uomId))
      form.setValue("uomId", chosen.uomId);
    form.setValue("sacHsn", chosen.sacHsn ?? "");
    if (chosen.adoptedRate != null)
      form.setValue("rate", paiseToRupees(chosen.adoptedRate));
  };

  const submit = form.handleSubmit(async (values) => {
    const place = values.place === NONE ? null : values.place;
    const body = {
      sectionId: values.sectionId,
      itemNo: values.itemNo,
      description: values.description,
      uomId: values.uomId,
      sacHsn: values.sacHsn === "" ? null : values.sacHsn,
      quantity: values.quantity,
      rate: financial ? rupeesToPaise(values.rate) : null,
      wingId: options.structure === "wings" ? place : null,
      locationId: options.structure === "locations" ? place : null,
    };
    try {
      if (item == null)
        await create.mutateAsync({
          ...body,
          projectId,
          libraryItemId: library?.id ?? null,
        });
      else
        await update.mutateAsync({
          ...body,
          // A measured item's figures go back as they are.
          quantity: measured ? quantityInput(item.quantity) : body.quantity,
          rate: measured ? item.rate : body.rate,
          expectedUpdatedAt: item.updatedAt,
        });
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  const select = (
    name: "sectionId" | "uomId" | "place",
    label: string,
    items: { value: string; label: string }[],
    placeholder: string,
  ) => (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`${id}-${name}`}>{label}</Label>
      <Controller
        name={name}
        control={form.control}
        render={({ field }) => (
          <Select
            items={items}
            value={field.value === "" ? null : field.value}
            onValueChange={(next) => {
              if (next == null) return;
              field.onChange(next);
            }}
          >
            <SelectTrigger
              id={`${id}-${name}`}
              size="lg"
              className="w-full min-w-0"
              aria-invalid={errors[name] != null}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {items.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError message={errors[name]?.message} />
    </div>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-2xl">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">
              {item == null ? "Add BOQ item" : `Edit item ${item.itemNo}`}
            </DialogTitle>
            <DialogDescription>
              {item == null
                ? "Type it as the contract prints it, or fill it from your Item Library."
                : measured
                  ? "A checked measurement names this item: change its quantity or rate through a Variation."
                  : "Before it is measured, changing the quantity or rate corrects the contract figure too."}
            </DialogDescription>
          </DialogHeader>
          {item == null ? (
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-library`}>From the Item Library</Label>
              <LibraryPicker
                id={`${id}-library`}
                projectId={projectId}
                value={library}
                onChange={pick}
              />
              <p className="text-muted-foreground text-xs">
                Optional. Fills the fields below; you can change them.
              </p>
            </div>
          ) : null}
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {select("sectionId", "Section", sectionItems, "Select…")}
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-itemNo`}>Item no</Label>
              <Input
                id={`${id}-itemNo`}
                className="h-10"
                autoComplete="off"
                placeholder="2.1.3"
                aria-invalid={errors.itemNo != null}
                {...form.register("itemNo")}
              />
              <FieldError message={errors.itemNo?.message} />
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-description`}>Description</Label>
            <Textarea
              id={`${id}-description`}
              rows={3}
              aria-invalid={errors.description != null}
              {...form.register("description")}
            />
            <FieldError message={errors.description?.message} />
          </div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-3">
            {select("uomId", "UoM", uomItems, "Select…")}
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-sacHsn`}>SAC/HSN</Label>
              <Input
                id={`${id}-sacHsn`}
                className="h-10"
                inputMode="numeric"
                autoComplete="off"
                placeholder="995411"
                aria-invalid={errors.sacHsn != null}
                {...form.register("sacHsn")}
              />
              <FieldError message={errors.sacHsn?.message} />
            </div>
            {select("place", placeWord, placeItems, `No ${placeWord}`)}
          </div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-quantity`}>Quantity</Label>
              <Input
                id={`${id}-quantity`}
                className="h-10"
                inputMode="decimal"
                autoComplete="off"
                readOnly={measured}
                aria-invalid={errors.quantity != null}
                {...form.register("quantity")}
              />
              <FieldError message={errors.quantity?.message} />
            </div>
            {financial ? (
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${id}-rate`}>Rate</Label>
                <MoneyInput
                  id={`${id}-rate`}
                  className="h-10"
                  readOnly={measured}
                  aria-invalid={errors.rate != null}
                  suffix="per UoM"
                  {...form.register("rate")}
                />
                <FieldError message={errors.rate?.message} />
              </div>
            ) : null}
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                form.formState.isSubmitting ||
                create.isPending ||
                update.isPending
              }
            >
              {item == null ? "Add item" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
