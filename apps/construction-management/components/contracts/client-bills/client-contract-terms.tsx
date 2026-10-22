"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  clientContractQuery,
  useSaveClientContract,
  type ClientContract,
} from "@/src/queries/contracts-client-bills";
import { QueryHttpError } from "@/src/queries/http";

import { dateText, moneyOrDash, percentText } from "./client-bill-format";

const percent = (max: number, label: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (/^\d{1,3}(\.\d{1,2})?$/.test(value) && Number(value) <= max),
      `${label} is a percentage from 0 to ${String(max)}, with at most two decimals.`,
    );

const TermsSchema = z.object({
  retentionPercent: percent(100, "Retention"),
  retentionCapPercent: percent(100, "The cap"),
  retentionCompletionPercent: percent(100, "Released at completion"),
  dlpMonths: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" || (/^\d{1,3}$/.test(value) && Number(value) <= 120),
      "The DLP is a whole number of months from 0 to 120.",
    ),
  handoverOn: z.string(),
  sacCode: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{4,8}$/.test(value),
      "The SAC code is 4 to 8 digits.",
    ),
  gstRate: percent(28, "GST"),
});

type TermsValues = z.infer<typeof TermsSchema>;

const FIELDS = {
  RETENTION_PERCENT_INVALID: "retentionPercent",
  RETENTION_CAP_INVALID: "retentionCapPercent",
  RETENTION_COMPLETION_INVALID: "retentionCompletionPercent",
  DLP_MONTHS_INVALID: "dlpMonths",
  HANDOVER_ON_INVALID: "handoverOn",
  SAC_HSN_INVALID: "sacCode",
  GST_RATE_INVALID: "gstRate",
} as const;

/** `5.00` → `5`; null → "". */
function plain(value: string | null): string {
  return value == null ? "" : value.replace(/\.?0+$/, "");
}

function valuesOf(contract: ClientContract): TermsValues {
  const { terms } = contract;
  return {
    retentionPercent: plain(terms.retentionPercent),
    retentionCapPercent: plain(terms.retentionCapPercent),
    retentionCompletionPercent: plain(terms.retentionCompletionPercent),
    dlpMonths: terms.dlpMonths == null ? "" : String(terms.dlpMonths),
    handoverOn: terms.handoverOn ?? "",
    sacCode: terms.sacCode ?? "",
    gstRate: plain(terms.gstRate),
  };
}

const blank = (value: string) => (value.trim() === "" ? null : value.trim());

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}

/**
 * The Project's **client contract terms** (CM-1107), on the Client Bills
 * page: retention % per bill and its cap (a % of the BOQ's current value),
 * the share released at completion, the DLP and the handover date that
 * starts it (CM-1108), and the SAC and GST rate the tax invoice carries.
 * Client Bill Update holders change them in a dialog; bills drafted or
 * refreshed afterwards use them.
 */
export function ClientContractTerms({ projectId }: { projectId: string }) {
  const { data: contract } = useSuspenseQuery(clientContractQuery(projectId));
  const [open, setOpen] = useState(false);
  const { terms } = contract;
  return (
    <section
      aria-labelledby="client-terms-title"
      className="min-w-0 space-y-3 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="client-terms-title" className="font-semibold">
            Client contract terms
          </h3>
          <p className="text-muted-foreground text-xs">
            {contract.updatedAt == null
              ? "Not set yet: bills hold no retention and charge no GST until they are."
              : "Used by bills drafted or refreshed from now on."}
          </p>
        </div>
        {contract.canEdit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setOpen(true);
            }}
          >
            <Settings2 aria-hidden="true" />
            Edit terms
          </Button>
        ) : null}
      </div>
      <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <Term
          label="Retention"
          value={`${percentText(terms.retentionPercent)} per bill`}
        />
        <Term
          label="Retention cap"
          value={
            terms.retentionCapPercent == null
              ? "No cap"
              : `${percentText(terms.retentionCapPercent)} of the BOQ${contract.boqValue == null ? "" : ` (${moneyOrDash(contract.boqValue)})`}`
          }
        />
        <Term
          label="Released at completion"
          value={percentText(terms.retentionCompletionPercent)}
        />
        <Term
          label="DLP"
          value={
            terms.dlpMonths == null
              ? "—"
              : `${String(terms.dlpMonths)} months${terms.handoverOn == null ? "" : ` from ${dateText(terms.handoverOn)}`}`
          }
        />
        <Term label="SAC" value={terms.sacCode ?? "—"} />
        <Term
          label="GST"
          value={terms.gstRate == null ? "No GST" : percentText(terms.gstRate)}
        />
        {contract.retentionReceivable == null ? null : (
          <Term
            label="Retention receivable"
            value={moneyOrDash(contract.retentionReceivable)}
          />
        )}
      </dl>
      {open ? (
        <ClientContractTermsDialog
          projectId={projectId}
          contract={contract}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

function ClientContractTermsDialog({
  projectId,
  contract,
  onClose,
}: {
  projectId: string;
  contract: ClientContract;
  onClose: () => void;
}) {
  const save = useSaveClientContract(projectId);
  const form = useForm<TermsValues>({
    resolver: zodResolver(TermsSchema),
    defaultValues: valuesOf(contract),
  });
  const { register, handleSubmit, formState, setError } = form;
  const { errors } = formState;
  const field = (
    name: keyof TermsValues,
    label: string,
    props: {
      placeholder?: string;
      type?: string;
      inputMode?: "decimal" | "numeric";
    } = {},
  ) => (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`terms-${name}`}>{label}</Label>
      <Input
        id={`terms-${name}`}
        type={props.type ?? "text"}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        aria-invalid={errors[name] != null}
        {...register(name)}
      />
      <FieldError message={errors[name]?.message} />
    </div>
  );
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={handleSubmit((values) => {
            save.mutate(
              {
                expectedUpdatedAt: contract.updatedAt,
                retentionPercent: blank(values.retentionPercent),
                retentionCapPercent: blank(values.retentionCapPercent),
                retentionCompletionPercent: blank(
                  values.retentionCompletionPercent,
                ),
                dlpMonths:
                  blank(values.dlpMonths) == null
                    ? null
                    : Number(values.dlpMonths),
                handoverOn: blank(values.handoverOn),
                sacCode: blank(values.sacCode),
                gstRate: blank(values.gstRate),
              },
              {
                onSuccess: onClose,
                onError: (failure) => {
                  const named =
                    failure instanceof QueryHttpError
                      ? (FIELDS as Record<string, keyof TermsValues>)[
                          failure.code
                        ]
                      : undefined;
                  const found = fieldForCode(failure, {});
                  setError(named ?? "root", { message: found.message });
                },
              },
            );
          })}
        >
          <DialogHeader>
            <DialogTitle>Client contract terms</DialogTitle>
            <DialogDescription>
              Bills drafted or refreshed after you save use these. A bill
              waiting for approval keeps what it was drafted with.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            {field("retentionPercent", "Retention per bill (%)", {
              inputMode: "decimal",
              placeholder: "0",
            })}
            {field("retentionCapPercent", "Retention cap (% of the BOQ)", {
              inputMode: "decimal",
              placeholder: "No cap",
            })}
            {field("retentionCompletionPercent", "Released at completion (%)", {
              inputMode: "decimal",
              placeholder: "50",
            })}
            {field("dlpMonths", "DLP (months)", {
              inputMode: "numeric",
              placeholder: "12",
            })}
            {field("handoverOn", "Handover date", { type: "date" })}
            {field("sacCode", "SAC", {
              inputMode: "numeric",
              placeholder: "9954",
            })}
            {field("gstRate", "GST (%)", {
              inputMode: "decimal",
              placeholder: "18",
            })}
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save terms"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
