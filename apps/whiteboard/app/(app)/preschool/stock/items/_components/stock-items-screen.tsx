"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PackageIcon } from "@phosphor-icons/react/ssr";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { TableCard } from "@/app/(app)/_components/table-card";

import { RoleGate } from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { STOCK_UNIT_PICKS } from "@/lib/preschool-stock";
import { QueryHttpError } from "@/src/queries/http";
import {
  archiveStockItem,
  createStockItem,
  restoreStockItem,
  STOCK_CATEGORY_LABELS,
  stockItemsQueryOptions,
  stockKeys,
  updateStockItemDetails,
  type PreschoolStockCategory,
  type PreschoolStockItem,
} from "@/src/queries/preschool/stock";

const CATEGORY_ITEMS = (
  Object.entries(STOCK_CATEGORY_LABELS) as [PreschoolStockCategory, string][]
).map(([value, label]) => ({ value, label }));

const KIND_ITEMS = [
  { value: "consumable", label: "Consumable" },
  { value: "asset", label: "Asset" },
] as const;

const KIND_HINT = {
  consumable: "Used up or given away: books, notebooks, uniforms, kits.",
  asset: "Kept by the Centre: chairs, toys, equipment.",
} as const;

const schema = z.object({
  name: z.string().trim().min(1, "Enter the item's name").max(200),
  category: z.enum([
    "books",
    "notebooks",
    "stationery",
    "uniform",
    "kit",
    "toys_learning_aids",
    "housekeeping",
    "furniture_equipment",
    "other",
  ]),
  kind: z.enum(["consumable", "asset"]),
  unit: z.string().trim().min(1, "Enter the unit").max(20),
  reorderLevel: z
    .string()
    .trim()
    .regex(/^\d{0,6}$/, "Enter a whole number, or leave it blank"),
});

type Values = z.infer<typeof schema>;

function StockItemForm({
  item,
  onDone,
}: {
  item: PreschoolStockItem | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: item?.name ?? "",
      category: item?.category ?? "books",
      kind: item?.kind ?? "consumable",
      unit: item?.unit ?? "piece",
      reorderLevel: item?.reorderLevel == null ? "" : String(item.reorderLevel),
    },
  });
  const kind = useWatch({ control, name: "kind" });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        const body = {
          name: values.name,
          category: values.category,
          kind: values.kind,
          unit: values.unit,
          reorderLevel:
            values.reorderLevel === "" ? null : Number(values.reorderLevel),
        };
        try {
          if (item == null) await createStockItem(body);
          else await updateStockItemDetails(item.id, body);
          await queryClient.invalidateQueries({ queryKey: stockKeys.all });
          onDone();
        } catch (error) {
          if (
            error instanceof QueryHttpError &&
            error.code === "STOCK_ITEM_NAME_IN_USE"
          )
            setError("name", { message: error.message });
          else
            setError("root", {
              message:
                error instanceof QueryHttpError
                  ? error.message
                  : "Could not save the Stock Item.",
            });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="stock-item-name" required>
          Name
        </Label>
        <Input
          id="stock-item-name"
          aria-required
          className="h-10"
          placeholder="LKG English reader"
          aria-invalid={errors.name != null}
          {...register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="stock-item-category" required>
            Category
          </Label>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select
                items={CATEGORY_ITEMS}
                value={field.value}
                onValueChange={(value) => {
                  if (value != null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="stock-item-category"
                  size="lg"
                  className="w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ITEMS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stock-item-kind" required>
            Kind
          </Label>
          <Controller
            name="kind"
            control={control}
            render={({ field }) => (
              <Select
                items={[...KIND_ITEMS]}
                value={field.value}
                onValueChange={(value) => {
                  if (value != null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="stock-item-kind"
                  size="lg"
                  className="w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_ITEMS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-muted-foreground text-xs">{KIND_HINT[kind]}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="stock-item-unit" required>
            Unit
          </Label>
          <Input
            id="stock-item-unit"
            aria-required
            className="h-10"
            aria-invalid={errors.unit != null}
            {...register("unit")}
          />
          <div className="flex flex-wrap gap-1.5">
            {STOCK_UNIT_PICKS.map((unit) => (
              <Button
                key={unit}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setValue("unit", unit, { shouldValidate: true });
                }}
              >
                {unit}
              </Button>
            ))}
          </div>
          <FieldError message={errors.unit?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stock-item-reorder">Reorder level</Label>
          <Input
            id="stock-item-reorder"
            inputMode="numeric"
            className="h-10"
            placeholder="Never low"
            aria-invalid={errors.reorderLevel != null}
            {...register("reorderLevel")}
          />
          <p className="text-muted-foreground text-xs">
            A Centre at or below this is low on the item.
          </p>
          <FieldError message={errors.reorderLevel?.message} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Save Stock Item
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The Workspace's Stock Items by category: add, edit, archive, restore. */
export function StockItemsMaster() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    stockItemsQueryOptions({ includeArchived: true }),
  );
  const [editing, setEditing] = useState<PreschoolStockItem | "new" | null>(
    null,
  );
  const toggle = useMutation({
    mutationFn: (item: PreschoolStockItem) =>
      item.isArchived ? restoreStockItem(item.id) : archiveStockItem(item.id),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: stockKeys.all });
    },
  });
  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add Stock Item
    </Button>
  );
  const groups = CATEGORY_ITEMS.map((category) => ({
    ...category,
    items: data.items.filter((item) => item.category === category.value),
  })).filter((group) => group.items.length > 0);
  return (
    <PreschoolPage
      title="Stock Items"
      meta="Defined once for the Workspace; every Centre keeps its own count."
      actions={data.items.length === 0 ? undefined : addButton}
    >
      {data.items.length === 0 ? (
        <EmptyState
          className="border"
          icon={PackageIcon}
          tone="orange"
          title="No Stock Items yet"
          description="Add the books, notebooks, uniforms, kits and supplies your Centres keep."
          actions={addButton}
        />
      ) : (
        groups.map((group) => (
          <section
            key={group.value}
            aria-labelledby={`stock-group-${group.value}`}
            className="space-y-2"
          >
            <h2
              id={`stock-group-${group.value}`}
              className="text-lg font-semibold"
            >
              {group.label}
            </h2>
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden sm:table-cell">Unit</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      Reorder at
                    </TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item) => (
                    <TableRow
                      key={item.id}
                      className={
                        item.isArchived ? "text-muted-foreground" : undefined
                      }
                    >
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{item.name}</span>
                          <Badge variant="outline">
                            {item.kind === "asset" ? "Asset" : "Consumable"}
                          </Badge>
                          {item.isArchived ? (
                            <Badge variant="secondary">Archived</Badge>
                          ) : null}
                        </div>
                        <div className="text-muted-foreground text-xs sm:hidden">
                          {item.unit}
                          {item.reorderLevel == null
                            ? null
                            : ` · reorder at ${item.reorderLevel}`}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {item.unit}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {item.reorderLevel ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {item.isArchived ? null : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit ${item.name}`}
                              onClick={() => {
                                setEditing(item);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={toggle.isPending}
                            aria-label={`${item.isArchived ? "Restore" : "Archive"} ${item.name}`}
                            onClick={() => {
                              toggle.mutate(item);
                            }}
                          >
                            {item.isArchived ? "Restore" : "Archive"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          </section>
        ))
      )}
      <FormAlert
        message={
          toggle.error instanceof QueryHttpError
            ? toggle.error.message
            : undefined
        }
      />
      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Add Stock Item" : "Edit Stock Item"}
            </DialogTitle>
            <DialogDescription>
              Every Centre counts this item separately.
            </DialogDescription>
          </DialogHeader>
          {editing == null ? null : (
            <StockItemForm
              item={editing === "new" ? null : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </PreschoolPage>
  );
}

export function StockItemsScreen() {
  return (
    <RoleGate roles={["owner"]}>
      <StockItemsMaster />
    </RoleGate>
  );
}
