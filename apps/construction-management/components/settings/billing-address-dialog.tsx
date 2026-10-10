"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
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
import { fieldForCode } from "@/lib/server-errors";
import {
  createBillingAddress,
  updateBillingAddress,
  type BillingAddressItem,
} from "@/src/queries/billing-addresses";
import { GST_STATES, gstStateName } from "@/src/shared-kernel/gst-states";
import { isValidGstin } from "@/src/shared-kernel/tax-ids";

const NAME_MAX = 120;
const ADDRESS_MAX = 500;

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a name for this billing address")
      .max(NAME_MAX, `Use at most ${String(NAME_MAX)} characters`),
    address: z
      .string()
      .trim()
      .min(1, "Enter the address")
      .max(ADDRESS_MAX, `Use at most ${String(ADDRESS_MAX)} characters`),
    stateCode: z.string().min(1, "Choose the GST state"),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || isValidGstin(value), {
        message: "Enter a valid 15-character GSTIN",
      }),
  })
  .superRefine((values, context) => {
    if (
      values.gstin !== "" &&
      values.stateCode !== "" &&
      values.gstin.slice(0, 2) !== values.stateCode
    )
      context.addIssue({
        code: "custom",
        path: ["gstin"],
        message: `A GSTIN of ${gstStateName(values.stateCode) ?? values.stateCode} starts with ${values.stateCode}`,
      });
  });

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const STATE_ITEMS = GST_STATES.map((state) => ({
  value: state.code,
  label: `${state.name} (${state.code})`,
}));

const SERVER_FIELDS: Record<string, keyof Values> = {
  BILLING_ADDRESS_NAME_REQUIRED: "name",
  BILLING_ADDRESS_NAME_TOO_LONG: "name",
  BILLING_ADDRESS_NAME_IN_USE: "name",
  ADDRESS_REQUIRED: "address",
  ADDRESS_TOO_LONG: "address",
  GST_STATE_INVALID: "stateCode",
  GSTIN_INVALID: "gstin",
  GSTIN_STATE_MISMATCH: "gstin",
};

/** Add or edit a billing address; typing a GSTIN picks its state. */
export function BillingAddressDialog({
  address,
  onSaved,
  onClose,
}: {
  /** Null to add one. */
  address: BillingAddressItem | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: address?.name ?? "",
      address: address?.address ?? "",
      stateCode: address?.stateCode ?? "",
      gstin: address?.gstin ?? "",
    },
  });
  const mutation = useMutation({
    mutationFn: (values: Parsed) => {
      const body = {
        name: values.name,
        address: values.address,
        stateCode: values.stateCode,
        gstin: values.gstin === "" ? null : values.gstin,
      };
      return address == null
        ? createBillingAddress(body)
        : updateBillingAddress(address.id, {
            ...body,
            expectedUpdatedAt: address.updatedAt,
          });
    },
  });
  const errors = form.formState.errors;
  const gstinField = form.register("gstin", {
    onChange: (event: { target: { value: string } }) => {
      const state = event.target.value.trim().slice(0, 2);
      if (/^\d{2}$/.test(state) && gstStateName(state) != null)
        form.setValue("stateCode", state, { shouldDirty: true });
    },
  });

  const submit = async (values: Parsed) => {
    try {
      await mutation.mutateAsync(values);
      onSaved();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {address == null ? "Add billing address" : "Edit billing address"}
            </DialogTitle>
            <DialogDescription>
              Purchase Orders print this address and GSTIN. Orders already saved
              keep the copy they were made with.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="billing-name">Name</Label>
            <Input
              id="billing-name"
              placeholder="Head office"
              className="h-10"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="billing-address">Address</Label>
            <Textarea
              id="billing-address"
              rows={3}
              placeholder="12, Anna Salai, Chennai 600002"
              aria-invalid={errors.address != null}
              {...form.register("address")}
            />
            <FieldError message={errors.address?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="billing-gstin">GSTIN (optional)</Label>
              <Input
                id="billing-gstin"
                placeholder="33AAPFA0939F1ZM"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={15}
                className="h-10 uppercase"
                aria-invalid={errors.gstin != null}
                {...gstinField}
              />
              <FieldError message={errors.gstin?.message} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="billing-state">GST state</Label>
              <Controller
                name="stateCode"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={STATE_ITEMS}
                    value={field.value === "" ? null : field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="billing-state"
                      size="lg"
                      className="w-full min-w-0"
                      aria-invalid={errors.stateCode != null}
                    >
                      <SelectValue placeholder="Choose a state" />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="GST states"
                    >
                      {STATE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.stateCode?.message} />
            </div>
          </div>

          <FormAlert message={errors.root?.message} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save address"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
