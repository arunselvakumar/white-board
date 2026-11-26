"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Suspense, useDeferredValue, useState } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type FieldValues,
  type Path,
  type UseFormSetError,
} from "react-hook-form";
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
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { parseRupeesInput } from "@/lib/money";
import { insufficientStockRow } from "@/lib/preschool-stock";
import { todayInIndia } from "@/src/preschool/domain/dates";
import { QueryHttpError } from "@/src/queries/http";
import { preschoolChildrenQueryOptions } from "@/src/queries/preschool/children";
import { classroomsQueryOptions } from "@/src/queries/preschool/classrooms";
import { staffQueryOptions } from "@/src/queries/preschool/staff";
import {
  adjustStock,
  issueStockToChild,
  issueStockToClassroom,
  issueStockToStaff,
  receiveStock,
  stockKeys,
  transferStock,
} from "@/src/queries/preschool/stock";

import {
  checkDistinctItems,
  emptyLine,
  stockLineSchema,
  StockLinesField,
  type StockLineValues,
  type StockRow,
} from "./stock-lines-field";

export type StockDialog =
  | { kind: "receive"; itemId?: string }
  | { kind: "issue"; itemId?: string }
  | { kind: "adjust"; itemId: string }
  | { kind: "transfer"; itemId?: string };

function dateField(today: string) {
  return z
    .string()
    .min(1, "Enter the date")
    .refine((value) => value <= today, "The date cannot be in the future");
}

function lines(values: readonly StockLineValues[]) {
  return values.map((line) => ({
    itemId: line.itemId,
    quantity: Number(line.quantity),
  }));
}

/** Server errors onto the form: a shortage onto its row's quantity. */
function showError<Values extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<Values>,
  stock: readonly StockRow[],
  rows: readonly StockLineValues[],
  quantityField?: Path<Values>,
): void {
  if (!(error instanceof QueryHttpError)) {
    setError("root", { message: "Could not save. Please try again." });
    return;
  }
  if (error.code === "STOCK_INSUFFICIENT") {
    if (quantityField != null) {
      setError(quantityField, { message: error.message });
      return;
    }
    const index = insufficientStockRow(
      error.message,
      rows.map(
        (row) => stock.find((item) => item.itemId === row.itemId)?.name ?? null,
      ),
    );
    if (index >= 0) {
      setError(`lines.${index}.quantity` as Path<Values>, {
        message: error.message,
      });
      return;
    }
  }
  if (error.code === "STOCK_DATE_IN_FUTURE") {
    setError("movedOn" as Path<Values>, { message: error.message });
    return;
  }
  setError("root", { message: error.message });
}

function useStockSaved(onDone: () => void) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: stockKeys.all });
    onDone();
  };
}

function FormButtons({
  submitLabel,
  submitting,
  onCancel,
}: {
  submitLabel: string;
  submitting: boolean;
  onCancel: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={submitting}>
        {submitLabel}
      </Button>
    </DialogFooter>
  );
}

function ReceiveForm({
  stock,
  itemId,
  onDone,
}: {
  stock: readonly StockRow[];
  itemId?: string;
  onDone: () => void;
}) {
  const { centre } = useActiveCentre();
  const today = todayInIndia(new Date());
  const saved = useStockSaved(onDone);
  const schema = z
    .object({
      supplierName: z.string().trim().max(200),
      billNumber: z.string().trim().max(60),
      movedOn: dateField(today),
      note: z.string().trim().max(300),
      lines: z.array(stockLineSchema).min(1),
    })
    .superRefine((value, ctx) => {
      checkDistinctItems(value.lines, ctx);
    });
  type Values = z.infer<typeof schema>;
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplierName: "",
      billNumber: "",
      movedOn: today,
      note: "",
      lines: [emptyLine(itemId)],
    },
  });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await receiveStock({
            centreId: centre.id,
            movedOn: values.movedOn,
            supplierName:
              values.supplierName === "" ? null : values.supplierName,
            billNumber: values.billNumber === "" ? null : values.billNumber,
            note: values.note === "" ? null : values.note,
            lines: values.lines.map((line) => ({
              itemId: line.itemId,
              quantity: Number(line.quantity),
              unitCostPaise:
                line.unitCostRupees === ""
                  ? null
                  : parseRupeesInput(line.unitCostRupees),
            })),
          });
          await saved();
        } catch (error) {
          showError(error, setError, stock, values.lines);
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="receive-supplier">Supplier</Label>
          <Input
            id="receive-supplier"
            className="h-10"
            {...register("supplierName")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receive-bill">Bill number</Label>
          <Input
            id="receive-bill"
            className="h-10"
            {...register("billNumber")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receive-date" required>
            Date received
          </Label>
          <Input
            id="receive-date"
            type="date"
            max={today}
            aria-required
            className="h-10"
            {...register("movedOn")}
          />
          <FieldError message={errors.movedOn?.message} />
        </div>
      </div>
      <StockLinesField
        control={control}
        register={register}
        errors={errors}
        stock={stock}
        withCost
      />
      <div className="space-y-1.5">
        <Label htmlFor="receive-note">Note</Label>
        <Textarea id="receive-note" rows={2} {...register("note")} />
      </div>
      <FormButtons
        submitLabel="Receive stock"
        submitting={isSubmitting}
        onCancel={onDone}
      />
    </form>
  );
}

function ChildPicker({
  centreId,
  value,
  onChange,
  invalid,
}: {
  centreId: string;
  value: { id: string; name: string } | null;
  onChange: (child: { id: string; name: string } | null) => void;
  invalid: boolean;
}) {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const { data, isFetching } = useQuery({
    ...preschoolChildrenQueryOptions({
      centreId,
      ...(q === "" ? {} : { q }),
      limit: 8,
    }),
    enabled: value == null,
  });
  if (value != null)
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
        <span className="font-medium">{value.name}</span>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => {
            onChange(null);
          }}
        >
          Change
        </Button>
      </div>
    );
  return (
    <div className="space-y-2">
      <Input
        id="issue-child-search"
        type="search"
        placeholder="Search by name or admission number"
        className="h-10"
        aria-invalid={invalid}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />
      <ul aria-label="Children" className="grid gap-1">
        {(data?.items ?? []).map((child) => (
          <li key={child.id}>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between py-1.5"
              onClick={() => {
                onChange({ id: child.id, name: child.name });
              }}
            >
              <span>{child.name}</span>
              <span className="text-muted-foreground text-xs">
                {child.classroomName ?? child.admissionNumber}
              </span>
            </Button>
          </li>
        ))}
        {data?.items.length === 0 && !isFetching ? (
          <li className="text-muted-foreground px-3 text-sm">
            No Child matches.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

const TO_ITEMS = [
  { value: "child", label: "A Child" },
  { value: "classroom", label: "A Classroom" },
  { value: "staff", label: "A Staff member" },
] as const;

function RecipientSelect({
  id,
  items,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Select
      items={items}
      value={value === "" ? null : value}
      onValueChange={(next) => {
        if (next != null) onChange(next);
      }}
    >
      <SelectTrigger id={id} size="lg" className="w-full min-w-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ClassroomSelect(props: {
  centreId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { data } = useSuspenseQuery(classroomsQueryOptions(props.centreId));
  return (
    <RecipientSelect
      id="issue-recipient"
      placeholder="Choose a Classroom"
      items={data.items.map((classroom) => ({
        value: classroom.id,
        label: classroom.name,
      }))}
      value={props.value}
      onChange={props.onChange}
    />
  );
}

function StaffSelect(props: {
  centreId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { data } = useSuspenseQuery(staffQueryOptions(props.centreId));
  return (
    <RecipientSelect
      id="issue-recipient"
      placeholder="Choose a Staff member"
      items={data.items
        .filter((member) => member.status === "active")
        .map((member) => ({ value: member.id, label: member.name }))}
      value={props.value}
      onChange={props.onChange}
    />
  );
}

function IssueForm({
  stock,
  itemId,
  onDone,
}: {
  stock: readonly StockRow[];
  itemId?: string;
  onDone: () => void;
}) {
  const { centre } = useActiveCentre();
  const today = todayInIndia(new Date());
  const saved = useStockSaved(onDone);
  const schema = z
    .object({
      to: z.enum(["child", "classroom", "staff"]),
      child: z.object({ id: z.string(), name: z.string() }).nullable(),
      recipientId: z.string(),
      movedOn: dateField(today),
      note: z.string().trim().max(300),
      lines: z.array(stockLineSchema).min(1),
    })
    .superRefine((value, ctx) => {
      checkDistinctItems(value.lines, ctx);
      if (value.to === "child" && value.child == null)
        ctx.addIssue({
          code: "custom",
          path: ["child"],
          message: "Choose the Child",
        });
      if (value.to !== "child" && value.recipientId === "")
        ctx.addIssue({
          code: "custom",
          path: ["recipientId"],
          message:
            value.to === "classroom"
              ? "Choose the Classroom"
              : "Choose the Staff member",
        });
    });
  type Values = z.infer<typeof schema>;
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
      to: "child",
      child: null,
      recipientId: "",
      movedOn: today,
      note: "",
      lines: [emptyLine(itemId)],
    },
  });
  const to = useWatch({ control, name: "to" });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        const body = {
          centreId: centre.id,
          movedOn: values.movedOn,
          note: values.note === "" ? null : values.note,
          lines: lines(values.lines),
        };
        try {
          if (values.to === "child")
            await issueStockToChild({
              ...body,
              childId: values.child?.id ?? "",
            });
          else if (values.to === "classroom")
            await issueStockToClassroom({
              ...body,
              classroomId: values.recipientId,
            });
          else
            await issueStockToStaff({ ...body, staffId: values.recipientId });
          await saved();
        } catch (error) {
          showError(error, setError, stock, values.lines);
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="issue-to" required>
            To
          </Label>
          <Controller
            name="to"
            control={control}
            render={({ field }) => (
              <RecipientSelect
                id="issue-to"
                placeholder="To"
                items={[...TO_ITEMS]}
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  setValue("recipientId", "");
                  setValue("child", null);
                }}
              />
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issue-date" required>
            Date
          </Label>
          <Input
            id="issue-date"
            type="date"
            max={today}
            aria-required
            className="h-10"
            {...register("movedOn")}
          />
          <FieldError message={errors.movedOn?.message} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor={to === "child" ? "issue-child-search" : "issue-recipient"}
          required
        >
          {to === "child"
            ? "Child"
            : to === "classroom"
              ? "Classroom"
              : "Staff member"}
        </Label>
        {to === "child" ? (
          <Controller
            name="child"
            control={control}
            render={({ field }) => (
              <ChildPicker
                centreId={centre.id}
                value={field.value}
                onChange={field.onChange}
                invalid={errors.child != null}
              />
            )}
          />
        ) : (
          <Suspense fallback={<Skeleton className="h-10 w-full" />}>
            <Controller
              name="recipientId"
              control={control}
              render={({ field }) =>
                to === "classroom" ? (
                  <ClassroomSelect
                    centreId={centre.id}
                    value={field.value}
                    onChange={field.onChange}
                  />
                ) : (
                  <StaffSelect
                    centreId={centre.id}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )
              }
            />
          </Suspense>
        )}
        <FieldError
          message={errors.child?.message ?? errors.recipientId?.message}
        />
      </div>
      <StockLinesField
        control={control}
        register={register}
        errors={errors}
        stock={stock}
      />
      <div className="space-y-1.5">
        <Label htmlFor="issue-note">Note</Label>
        <Textarea id="issue-note" rows={2} {...register("note")} />
      </div>
      <FormButtons
        submitLabel="Issue stock"
        submitting={isSubmitting}
        onCancel={onDone}
      />
    </form>
  );
}

export const ADJUST_REASONS = ["Damaged", "Lost", "Count correction"] as const;

function AdjustForm({ item, onDone }: { item: StockRow; onDone: () => void }) {
  const { centre } = useActiveCentre();
  const today = todayInIndia(new Date());
  const saved = useStockSaved(onDone);
  const schema = z.object({
    quantity: z
      .string()
      .trim()
      .regex(
        /^[+-]?[1-9]\d{0,5}$/,
        "Enter a whole number: −3 takes three away, 2 adds two",
      ),
    movedOn: dateField(today),
    note: z.string().trim().min(1, "Say why").max(300),
  });
  type Values = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: "", movedOn: today, note: "" },
  });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await adjustStock({
            centreId: centre.id,
            itemId: item.itemId,
            quantity: Number(values.quantity),
            movedOn: values.movedOn,
            note: values.note,
          });
          await saved();
        } catch (error) {
          showError(error, setError, [item], [], "quantity");
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <p className="text-muted-foreground text-sm">
        {item.onHand} {item.unit} on hand.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="adjust-quantity" required>
            Change ({item.unit})
          </Label>
          <Input
            id="adjust-quantity"
            inputMode="numeric"
            placeholder="-3 or 2"
            aria-required
            className="h-10"
            aria-invalid={errors.quantity != null}
            {...register("quantity")}
          />
          <FieldError message={errors.quantity?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adjust-date" required>
            Date
          </Label>
          <Input
            id="adjust-date"
            type="date"
            max={today}
            aria-required
            className="h-10"
            {...register("movedOn")}
          />
          <FieldError message={errors.movedOn?.message} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="adjust-note" required>
          Why
        </Label>
        <Input
          id="adjust-note"
          aria-required
          className="h-10"
          aria-invalid={errors.note != null}
          {...register("note")}
        />
        <div className="flex flex-wrap gap-2">
          {ADJUST_REASONS.map((reason) => (
            <Button
              key={reason}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setValue("note", reason, { shouldValidate: true });
              }}
            >
              {reason}
            </Button>
          ))}
        </div>
        <FieldError message={errors.note?.message} />
      </div>
      <FormButtons
        submitLabel="Adjust stock"
        submitting={isSubmitting}
        onCancel={onDone}
      />
    </form>
  );
}

function TransferForm({
  stock,
  itemId,
  onDone,
}: {
  stock: readonly StockRow[];
  itemId?: string;
  onDone: () => void;
}) {
  const { centre, centres } = useActiveCentre();
  const today = todayInIndia(new Date());
  const saved = useStockSaved(onDone);
  const schema = z
    .object({
      toCentreId: z.string().min(1, "Choose the Centre"),
      movedOn: dateField(today),
      note: z.string().trim().max(300),
      lines: z.array(stockLineSchema).min(1),
    })
    .superRefine((value, ctx) => {
      checkDistinctItems(value.lines, ctx);
    });
  type Values = z.infer<typeof schema>;
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      toCentreId: "",
      movedOn: today,
      note: "",
      lines: [emptyLine(itemId)],
    },
  });
  const others = centres
    .filter((other) => other.id !== centre.id && other.status === "active")
    .map((other) => ({ value: other.id, label: other.name }));
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await transferStock({
            fromCentreId: centre.id,
            toCentreId: values.toCentreId,
            movedOn: values.movedOn,
            note: values.note === "" ? null : values.note,
            lines: lines(values.lines),
          });
          await saved();
        } catch (error) {
          showError(error, setError, stock, values.lines);
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="transfer-to" required>
            Send to
          </Label>
          <Controller
            name="toCentreId"
            control={control}
            render={({ field }) => (
              <RecipientSelect
                id="transfer-to"
                placeholder="Choose a Centre"
                items={others}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          <FieldError message={errors.toCentreId?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="transfer-date" required>
            Date
          </Label>
          <Input
            id="transfer-date"
            type="date"
            max={today}
            aria-required
            className="h-10"
            {...register("movedOn")}
          />
          <FieldError message={errors.movedOn?.message} />
        </div>
      </div>
      <StockLinesField
        control={control}
        register={register}
        errors={errors}
        stock={stock}
      />
      <div className="space-y-1.5">
        <Label htmlFor="transfer-note">Note</Label>
        <Textarea id="transfer-note" rows={2} {...register("note")} />
      </div>
      <FormButtons
        submitLabel="Send stock"
        submitting={isSubmitting}
        onCancel={onDone}
      />
    </form>
  );
}

const DIALOG_COPY = {
  receive: {
    title: "Receive stock",
    description: "What came in on one bill. Unit costs are optional.",
  },
  issue: {
    title: "Issue stock",
    description:
      "Hand items to a Child, a Classroom or a Staff member. It does not bill.",
  },
  adjust: {
    title: "Adjust stock",
    description: "Correct the count after damage, loss or a stock check.",
  },
  transfer: {
    title: "Transfer to another Centre",
    description:
      "Sends items from this Centre; the other Centre receives them.",
  },
} as const;

/** Receive, Issue, Adjust and Transfer for the active Centre. */
export function StockMovementDialogs({
  dialog,
  stock,
  onClose,
}: {
  dialog: StockDialog | null;
  stock: readonly StockRow[];
  onClose: () => void;
}) {
  const adjustItem =
    dialog?.kind === "adjust"
      ? stock.find((row) => row.itemId === dialog.itemId)
      : undefined;
  return (
    <Dialog
      open={dialog != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {dialog == null
              ? null
              : dialog.kind === "adjust" && adjustItem != null
                ? `Adjust ${adjustItem.name}`
                : DIALOG_COPY[dialog.kind].title}
          </DialogTitle>
          <DialogDescription>
            {dialog == null ? null : DIALOG_COPY[dialog.kind].description}
          </DialogDescription>
        </DialogHeader>
        {dialog?.kind === "receive" ? (
          <ReceiveForm stock={stock} itemId={dialog.itemId} onDone={onClose} />
        ) : dialog?.kind === "issue" ? (
          <IssueForm stock={stock} itemId={dialog.itemId} onDone={onClose} />
        ) : dialog?.kind === "transfer" ? (
          <TransferForm stock={stock} itemId={dialog.itemId} onDone={onClose} />
        ) : adjustItem != null ? (
          <AdjustForm item={adjustItem} onDone={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
