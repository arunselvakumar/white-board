"use client";

import { navigateInApp } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { accountQueries, transferOwnership } from "@/src/queries/account";

import { ActionCodeStep } from "./action-code-step";
import { CandidateSelectSkeleton } from "./account-skeletons";

const schema = z.object({
  memberId: z.string().min(1, "Choose the new Owner"),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  TEAM_MEMBER_NOT_FOUND: "memberId",
  NEW_OWNER_NOT_ACTIVE: "memberId",
  OWNER_IS_NORMAL: "memberId",
  ACTION_CODE_INVALID: "code",
  ACTION_CODE_EXPIRED: "code",
  ACTION_CODE_NOT_FOUND: "code",
  ACTION_CODE_LOCKED: "code",
};

/**
 * Transfer ownership (CM-907): the Owner chooses an active Team Member and
 * enters a code. They become the Owner; you stay as an Admin. Afterwards
 * the app reloads, since what you may do has changed.
 */
export function TransferOwnershipDialog({
  companyName,
  onClose,
}: {
  companyName: string;
  onClose: () => void;
}) {
  const candidates = useQuery(accountQueries.candidates());
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: { memberId: "", code: "" },
  });
  const mutation = useMutation({ mutationFn: transferOwnership });
  const errors = form.formState.errors;
  const items = (candidates.data?.items ?? []).map((item) => ({
    value: item.id,
    label:
      item.designation == null
        ? item.name
        : `${item.name} · ${item.designation}`,
  }));

  const submit = async (values: Parsed) => {
    try {
      await mutation.mutateAsync(values);
      navigateInApp("/app");
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
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <form
          noValidate
          className="min-w-0 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              The Team Member you choose becomes the Owner of {companyName},
              with every right. You stay in the Company as an Admin. There is
              one Owner at a time.
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="new-owner" required>
              New Owner
            </Label>
            {candidates.isPending ? (
              <CandidateSelectSkeleton />
            ) : items.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No one can take over yet. The new Owner must be an active Team
                Member who has joined, not an HRMS Team Member.
              </p>
            ) : (
              <Controller
                name="memberId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={items}
                    value={field.value === "" ? null : field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="new-owner"
                      className="w-full min-w-0"
                      aria-required
                      aria-invalid={errors.memberId != null}
                    >
                      <SelectValue placeholder="Choose a Team Member" />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            <FieldError message={errors.memberId?.message} />
          </div>

          <Controller
            name="code"
            control={form.control}
            render={({ field }) => (
              <ActionCodeStep
                id="transfer-code"
                purpose="transfer_ownership"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.code?.message}
              />
            )}
          />
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || items.length === 0}
            >
              {mutation.isPending ? "Transferring…" : "Transfer ownership"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
